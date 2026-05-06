import { Router } from "express";
import { db, checkinsTable, membersTable, membershipPlansTable, gymWorkoutProgramsTable, workoutLogsTable } from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import jwt from "jsonwebtoken";
import {
  LookupMemberCheckinBody,
  ListCheckinsQueryParams,
} from "@workspace/api-zod";

const PORTAL_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || "gymflow-secret-key";

function signPortalToken(memberId: number, gymId: number): string {
  return jwt.sign({ memberId, gymId, type: "member-portal" }, PORTAL_SECRET, { expiresIn: "30d" });
}

function getScheduleRecommendation(schedule: any[], logs: any[]) {
  if (!schedule || schedule.length === 0) return null;
  const jsDay = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const todayStr = new Date().toISOString().split("T")[0];
  const alreadyLoggedToday = logs.find((l: any) => l.workoutDate === todayStr);
  const todayPlan = schedule[todayIdx] ?? schedule[0];
  return { todayPlan, alreadyLoggedToday: !!alreadyLoggedToday };
}

const router = Router();

router.get("/checkins", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const query = ListCheckinsQueryParams.safeParse(req.query);
  const { memberId } = query.success ? query.data : {};

  const gymMemberIds = await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.gymId, gymId));
  const memberIds = gymMemberIds.map(m => m.id);

  if (memberIds.length === 0) {
    res.json([]);
    return;
  }

  let rows = await db
    .select({
      id: checkinsTable.id,
      memberId: checkinsTable.memberId,
      memberName: membersTable.name,
      memberPhoto: membersTable.profilePhoto,
      checkedInAt: checkinsTable.checkedInAt,
      status: checkinsTable.status,
      deniedReason: checkinsTable.deniedReason,
    })
    .from(checkinsTable)
    .leftJoin(membersTable, eq(checkinsTable.memberId, membersTable.id))
    .orderBy(sql`${checkinsTable.checkedInAt} DESC`)
    .limit(100);

  rows = rows.filter(c => memberIds.includes(c.memberId));
  if (memberId) rows = rows.filter(c => c.memberId === memberId);

  res.json(rows.map(c => ({
    id: c.id,
    memberId: c.memberId,
    memberName: c.memberName ?? null,
    memberPhoto: c.memberPhoto ?? null,
    checkedInAt: c.checkedInAt.toISOString(),
    status: c.status,
    deniedReason: c.deniedReason ?? null,
  })));
});

router.post("/checkins/lookup", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const parsed = LookupMemberCheckinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { query } = parsed.data;

  // Try to find by ID first, then by phone
  const numericId = parseInt(query, 10);
  let member = null;

  if (!isNaN(numericId)) {
    const [found] = await db
      .select({
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
        createdAt: membersTable.createdAt,
      })
      .from(membersTable)
      .leftJoin(membershipPlansTable, eq(membersTable.planId, membershipPlansTable.id))
      .where(and(eq(membersTable.id, numericId), eq(membersTable.gymId, gymId)))
      .limit(1);
    member = found ?? null;
  }

  if (!member) {
    // Search by phone
    const [found] = await db
      .select({
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
        createdAt: membersTable.createdAt,
      })
      .from(membersTable)
      .leftJoin(membershipPlansTable, eq(membersTable.planId, membershipPlansTable.id))
      .where(and(eq(membersTable.phone, query), eq(membersTable.gymId, gymId)))
      .limit(1);
    member = found ?? null;
  }

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const allowed = member.membershipStatus === "active";
  const deniedReason = allowed ? null : "Membership expired or pending";

  const [checkin] = await db.insert(checkinsTable).values({
    memberId: member.id,
    status: allowed ? "allowed" : "denied",
    deniedReason,
  }).returning();

  // Days remaining
  let daysRemaining: number | null = null;
  if (member.endDate) {
    const end = new Date(member.endDate);
    const now = new Date();
    daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Member portal token
  const memberToken = signPortalToken(member.id, member.gymId);

  // Today's workout from active program
  let todayWorkout: any = null;
  const [program] = await db.select().from(gymWorkoutProgramsTable)
    .where(and(eq(gymWorkoutProgramsTable.gymId, member.gymId), eq(gymWorkoutProgramsTable.isActive, true)))
    .limit(1);
  if (program) {
    const schedule = JSON.parse(program.schedule);
    const since = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const logs = await db.select().from(workoutLogsTable)
      .where(and(eq(workoutLogsTable.memberId, member.id), gte(workoutLogsTable.workoutDate, since)));
    const rec = getScheduleRecommendation(schedule, logs.map(l => ({ ...l, exercises: JSON.parse(l.exercises) })));
    todayWorkout = rec ? { programName: program.name, ...rec } : null;
  }

  res.json({
    allowed,
    member: {
      id: member.id,
      gymId: member.gymId,
      name: member.name,
      email: member.email,
      phone: member.phone ?? null,
      profilePhoto: member.profilePhoto ?? null,
      membershipStatus: member.membershipStatus,
      planId: member.planId ?? null,
      planName: member.planName ?? null,
      startDate: member.startDate ?? null,
      endDate: member.endDate ?? null,
      createdAt: member.createdAt.toISOString(),
      daysRemaining,
    },
    checkin: {
      id: checkin.id,
      memberId: checkin.memberId,
      memberName: member.name,
      memberPhoto: member.profilePhoto ?? null,
      checkedInAt: checkin.checkedInAt.toISOString(),
      status: checkin.status,
      deniedReason: checkin.deniedReason ?? null,
    },
    memberToken,
    todayWorkout,
    message: allowed ? "Check-in successful" : `Check-in denied: ${deniedReason}`,
  });
});

export default router;
