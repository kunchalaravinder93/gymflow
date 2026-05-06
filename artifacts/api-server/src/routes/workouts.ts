import { Router } from "express";
import { db, workoutLogsTable, gymWorkoutProgramsTable, membersTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// ---- Recommendation Engine ----
// Maps today's weekday (0=Mon…6=Sun) to program day, adjusted by member's workout history

function getTodayRecommendation(schedule: any[], memberLogs: any[]) {
  if (!schedule || schedule.length === 0) return null;

  // 0=Mon…6=Sun (JS getDay: 0=Sun)
  const jsDay = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0

  const todayStr = new Date().toISOString().split("T")[0];
  const alreadyLoggedToday = memberLogs.find(l => l.workoutDate === todayStr);

  // What the program says for today
  const todayPlan = schedule[todayIdx] ?? schedule[0];

  // Next incomplete day (skipping rest, skipping already-done days in last 7 days)
  const last7Dates = memberLogs
    .filter(l => l.workoutDate >= new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0])
    .map(l => l.workoutDate);

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

// GET /workouts/member/:id — workout history
router.get("/workouts/member/:id", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const memberId = parseInt(req.params.id);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid member ID" }); return; }

  // Ensure member belongs to gym
  const [member] = await db.select({ id: membersTable.id })
    .from(membersTable)
    .where(and(eq(membersTable.id, memberId), eq(membersTable.gymId, gymId))).limit(1);
  if (!member) { res.status(404).json({ error: "Member not found" }); return; }

  const logs = await db.select().from(workoutLogsTable)
    .where(and(eq(workoutLogsTable.memberId, memberId), eq(workoutLogsTable.gymId, gymId)))
    .orderBy(sql`${workoutLogsTable.workoutDate} DESC`)
    .limit(30);

  res.json(logs.map(l => ({
    ...l,
    exercises: JSON.parse(l.exercises),
    muscleGroups: l.muscleGroups.split(","),
    createdAt: l.createdAt.toISOString(),
  })));
});

// GET /workouts/member/:id/recommendation — today's workout + weekly plan from gym's active program
router.get("/workouts/member/:id/recommendation", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const memberId = parseInt(req.params.id);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid member ID" }); return; }

  const [member] = await db.select({ id: membersTable.id })
    .from(membersTable)
    .where(and(eq(membersTable.id, memberId), eq(membersTable.gymId, gymId))).limit(1);
  if (!member) { res.status(404).json({ error: "Member not found" }); return; }

  // Get active program
  const [program] = await db.select().from(gymWorkoutProgramsTable)
    .where(and(eq(gymWorkoutProgramsTable.gymId, gymId), eq(gymWorkoutProgramsTable.isActive, true)))
    .limit(1);

  if (!program) { res.json({ program: null, recommendation: null }); return; }

  const schedule = JSON.parse(program.schedule);

  // Last 7 days of logs for this member
  const since = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const logs = await db.select().from(workoutLogsTable)
    .where(and(
      eq(workoutLogsTable.memberId, memberId),
      eq(workoutLogsTable.gymId, gymId),
      gte(workoutLogsTable.workoutDate, since)
    ));

  const recommendation = getTodayRecommendation(schedule, logs);

  res.json({
    program: {
      id: program.id,
      name: program.name,
      description: program.description,
    },
    recommendation,
  });
});

// POST /workouts/log — admin logs a workout for a member
router.post("/workouts/log", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const { memberId, workoutDate, muscleGroups, exercises, notes } = req.body;

  if (!memberId || !workoutDate || !muscleGroups || !exercises) {
    res.status(400).json({ error: "memberId, workoutDate, muscleGroups, exercises are required" });
    return;
  }

  const [member] = await db.select({ id: membersTable.id })
    .from(membersTable)
    .where(and(eq(membersTable.id, memberId), eq(membersTable.gymId, gymId))).limit(1);
  if (!member) { res.status(404).json({ error: "Member not found" }); return; }

  const [log] = await db.insert(workoutLogsTable).values({
    memberId,
    gymId,
    workoutDate,
    muscleGroups: Array.isArray(muscleGroups) ? muscleGroups.join(",") : muscleGroups,
    exercises: JSON.stringify(exercises),
    notes: notes ?? null,
    loggedBy: "admin",
  }).returning();

  res.status(201).json({
    ...log,
    exercises: JSON.parse(log.exercises),
    muscleGroups: log.muscleGroups.split(","),
    createdAt: log.createdAt.toISOString(),
  });
});

export default router;
