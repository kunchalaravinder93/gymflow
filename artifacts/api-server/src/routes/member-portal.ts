import { Router } from "express";
import { db, membersTable, membershipPlansTable, gymWorkoutProgramsTable, workoutLogsTable, gymsTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import jwt from "jsonwebtoken";

const PORTAL_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || "gymflow-secret-key";
const PORTAL_TOKEN_EXPIRY = "30d"; // member portal token lasts 30 days

const router = Router();

// ---- Token helpers ----
interface PortalPayload {
  memberId: number;
  gymId: number;
  type: "member-portal";
}

function signPortalToken(memberId: number, gymId: number): string {
  return jwt.sign({ memberId, gymId, type: "member-portal" } as PortalPayload, PORTAL_SECRET, { expiresIn: PORTAL_TOKEN_EXPIRY });
}

function verifyPortalToken(token: string): PortalPayload | null {
  try {
    const p = jwt.verify(token, PORTAL_SECRET) as PortalPayload;
    if (p.type !== "member-portal") return null;
    return p;
  } catch {
    return null;
  }
}

// ---- Shared recommendation logic ----
function getScheduleRecommendation(schedule: any[], logs: any[]) {
  if (!schedule || schedule.length === 0) return null;
  const jsDay = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const todayStr = new Date().toISOString().split("T")[0];
  const alreadyLoggedToday = logs.find((l: any) => l.workoutDate === todayStr);
  const todayPlan = schedule[todayIdx] ?? schedule[0];
  const last7Dates = logs
    .filter((l: any) => l.workoutDate >= new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0])
    .map((l: any) => l.workoutDate);
  return {
    todayPlan,
    alreadyLoggedToday: !!alreadyLoggedToday,
    alreadyLoggedData: alreadyLoggedToday ?? null,
    weeklyPlan: schedule.map((day, idx) => ({
      ...day,
      dayName: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][idx],
      isToday: idx === todayIdx,
      wasCompleted: last7Dates.includes(
        new Date(Date.now() - (todayIdx - idx) * 86400000).toISOString().split("T")[0]
      ),
    })),
  };
}

// ---- Admin: generate a portal token for a member ----
// GET /member-portal/token/:memberId  (requires JWT auth from admin)
import { requireAuth } from "../middlewares/auth";

router.get("/member-portal/token/:memberId", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const memberId = parseInt(req.params.memberId);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid member ID" }); return; }

  const [member] = await db.select({ id: membersTable.id, name: membersTable.name })
    .from(membersTable)
    .where(and(eq(membersTable.id, memberId), eq(membersTable.gymId, gymId))).limit(1);
  if (!member) { res.status(404).json({ error: "Member not found" }); return; }

  const token = signPortalToken(memberId, gymId);
  const portalUrl = `${req.protocol}://${req.get("host")}/member/${token}`;
  res.json({ token, portalUrl, memberName: member.name });
});

// ---- Public: get member portal data ----
// GET /member-portal/:token
router.get("/member-portal/:token", async (req, res): Promise<void> => {
  const payload = verifyPortalToken(req.params.token);
  if (!payload) { res.status(401).json({ error: "Invalid or expired portal link" }); return; }

  const { memberId, gymId } = payload;

  const [member] = await db.select({
    id: membersTable.id,
    gymId: membersTable.gymId,
    name: membersTable.name,
    email: membersTable.email,
    phone: membersTable.phone,
    profilePhoto: membersTable.profilePhoto,
    membershipStatus: membersTable.membershipStatus,
    planId: membersTable.planId,
    planName: membershipPlansTable.name,
    startDate: membersTable.startDate,
    endDate: membersTable.endDate,
  })
    .from(membersTable)
    .leftJoin(membershipPlansTable, eq(membersTable.planId, membershipPlansTable.id))
    .where(and(eq(membersTable.id, memberId), eq(membersTable.gymId, gymId)))
    .limit(1);

  if (!member) { res.status(404).json({ error: "Member not found" }); return; }

  // Days remaining
  let daysRemaining: number | null = null;
  if (member.endDate) {
    const end = new Date(member.endDate);
    const now = new Date();
    daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Gym name
  const [gym] = await db.select({ name: gymsTable.name }).from(gymsTable).where(eq(gymsTable.id, gymId)).limit(1);

  // Active program + recommendation
  const [program] = await db.select().from(gymWorkoutProgramsTable)
    .where(and(eq(gymWorkoutProgramsTable.gymId, gymId), eq(gymWorkoutProgramsTable.isActive, true)))
    .limit(1);

  let recommendation = null;
  let programInfo = null;
  if (program) {
    const schedule = JSON.parse(program.schedule);
    const since = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const logs = await db.select().from(workoutLogsTable)
      .where(and(eq(workoutLogsTable.memberId, memberId), eq(workoutLogsTable.gymId, gymId), gte(workoutLogsTable.workoutDate, since)));
    recommendation = getScheduleRecommendation(schedule, logs);
    programInfo = { id: program.id, name: program.name, description: program.description };
  }

  // Workout history (last 10)
  const history = await db.select().from(workoutLogsTable)
    .where(and(eq(workoutLogsTable.memberId, memberId), eq(workoutLogsTable.gymId, gymId)))
    .orderBy(sql`${workoutLogsTable.workoutDate} DESC`)
    .limit(10);

  res.json({
    member: {
      ...member,
      planName: member.planName ?? null,
      daysRemaining,
    },
    gym: gym ?? { name: "Your Gym" },
    program: programInfo,
    recommendation,
    history: history.map(l => ({
      ...l,
      exercises: JSON.parse(l.exercises),
      muscleGroups: l.muscleGroups.split(","),
      createdAt: l.createdAt.toISOString(),
    })),
    token: req.params.token,
  });
});

// ---- Public: member logs their own workout ----
// POST /member-portal/:token/log-workout
router.post("/member-portal/:token/log-workout", async (req, res): Promise<void> => {
  const payload = verifyPortalToken(req.params.token);
  if (!payload) { res.status(401).json({ error: "Invalid or expired portal link" }); return; }

  const { memberId, gymId } = payload;
  const { muscleGroups, exercises, notes, workoutDate } = req.body;

  if (!muscleGroups || !exercises) {
    res.status(400).json({ error: "muscleGroups and exercises are required" });
    return;
  }

  const today = workoutDate ?? new Date().toISOString().split("T")[0];

  // Upsert: if already logged today, replace it
  const existing = await db.select({ id: workoutLogsTable.id })
    .from(workoutLogsTable)
    .where(and(
      eq(workoutLogsTable.memberId, memberId),
      eq(workoutLogsTable.gymId, gymId),
      eq(workoutLogsTable.workoutDate, today)
    )).limit(1);

  let log;
  if (existing.length > 0) {
    [log] = await db.update(workoutLogsTable).set({
      muscleGroups: Array.isArray(muscleGroups) ? muscleGroups.join(",") : muscleGroups,
      exercises: JSON.stringify(exercises),
      notes: notes ?? null,
      loggedBy: "member",
    }).where(eq(workoutLogsTable.id, existing[0].id)).returning();
  } else {
    [log] = await db.insert(workoutLogsTable).values({
      memberId,
      gymId,
      workoutDate: today,
      muscleGroups: Array.isArray(muscleGroups) ? muscleGroups.join(",") : muscleGroups,
      exercises: JSON.stringify(exercises),
      notes: notes ?? null,
      loggedBy: "member",
    }).returning();
  }

  res.status(201).json({
    ...log,
    exercises: JSON.parse(log.exercises),
    muscleGroups: log.muscleGroups.split(","),
    createdAt: log.createdAt.toISOString(),
  });
});

export default router;
