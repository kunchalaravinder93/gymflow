import { Router } from "express";
import { db, subscriptionsTable, membershipPlansTable, membersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateSubscriptionBody,
  UpdateSubscriptionBody,
  GetSubscriptionParams,
  UpdateSubscriptionParams,
  ListSubscriptionsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const query = ListSubscriptionsQueryParams.safeParse(req.query);
  const { memberId, status } = query.success ? query.data : {};

  const gymMembers = await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.gymId, gymId));
  const memberIds = gymMembers.map(m => m.id);

  if (memberIds.length === 0) {
    res.json([]);
    return;
  }

  let subs = await db
    .select({
      id: subscriptionsTable.id,
      memberId: subscriptionsTable.memberId,
      planId: subscriptionsTable.planId,
      planName: membershipPlansTable.name,
      startDate: subscriptionsTable.startDate,
      endDate: subscriptionsTable.endDate,
      status: subscriptionsTable.status,
      gracePeriodDays: subscriptionsTable.gracePeriodDays,
      createdAt: subscriptionsTable.createdAt,
    })
    .from(subscriptionsTable)
    .leftJoin(membershipPlansTable, eq(subscriptionsTable.planId, membershipPlansTable.id))
    .orderBy(subscriptionsTable.createdAt);

  subs = subs.filter(s => memberIds.includes(s.memberId));
  if (memberId) subs = subs.filter(s => s.memberId === memberId);
  if (status) subs = subs.filter(s => s.status === status);

  res.json(subs.map(s => ({ ...s, planName: s.planName ?? null, createdAt: s.createdAt.toISOString() })));
});

router.post("/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const parsed = CreateSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Ensure member belongs to gym
  const [member] = await db.select().from(membersTable).where(and(eq(membersTable.id, parsed.data.memberId), eq(membersTable.gymId, gymId))).limit(1);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const [plan] = await db.select().from(membershipPlansTable).where(eq(membershipPlansTable.id, parsed.data.planId)).limit(1);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const start = new Date(parsed.data.startDate);
  start.setDate(start.getDate() + plan.durationDays);
  const endDate = start.toISOString().split("T")[0];

  const [sub] = await db.insert(subscriptionsTable).values({
    memberId: parsed.data.memberId,
    planId: parsed.data.planId,
    startDate: parsed.data.startDate,
    endDate,
    status: "active",
    gracePeriodDays: parsed.data.gracePeriodDays ?? 0,
  }).returning();

  // Update member
  await db.update(membersTable).set({
    planId: parsed.data.planId,
    membershipStatus: "active",
    startDate: parsed.data.startDate,
    endDate,
  }).where(eq(membersTable.id, parsed.data.memberId));

  res.status(201).json({
    id: sub.id,
    memberId: sub.memberId,
    planId: sub.planId,
    planName: plan.name,
    startDate: sub.startDate,
    endDate: sub.endDate,
    status: sub.status,
    gracePeriodDays: sub.gracePeriodDays,
    createdAt: sub.createdAt.toISOString(),
  });
});

router.get("/subscriptions/:id", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = GetSubscriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid subscription ID" });
    return;
  }

  const [sub] = await db
    .select({
      id: subscriptionsTable.id,
      memberId: subscriptionsTable.memberId,
      planId: subscriptionsTable.planId,
      planName: membershipPlansTable.name,
      startDate: subscriptionsTable.startDate,
      endDate: subscriptionsTable.endDate,
      status: subscriptionsTable.status,
      gracePeriodDays: subscriptionsTable.gracePeriodDays,
      createdAt: subscriptionsTable.createdAt,
    })
    .from(subscriptionsTable)
    .leftJoin(membershipPlansTable, eq(subscriptionsTable.planId, membershipPlansTable.id))
    .where(eq(subscriptionsTable.id, params.data.id))
    .limit(1);

  if (!sub) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  // Verify member belongs to gym
  const [member] = await db.select().from(membersTable).where(and(eq(membersTable.id, sub.memberId), eq(membersTable.gymId, gymId))).limit(1);
  if (!member) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  res.json({ ...sub, planName: sub.planName ?? null, createdAt: sub.createdAt.toISOString() });
});

router.patch("/subscriptions/:id", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = UpdateSubscriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid subscription ID" });
    return;
  }

  const parsed = UpdateSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select({ memberId: subscriptionsTable.memberId }).from(subscriptionsTable).where(eq(subscriptionsTable.id, params.data.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  const [member] = await db.select().from(membersTable).where(and(eq(membersTable.id, existing.memberId), eq(membersTable.gymId, gymId))).limit(1);
  if (!member) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  const [updated] = await db.update(subscriptionsTable)
    .set(parsed.data)
    .where(eq(subscriptionsTable.id, params.data.id))
    .returning();

  const [plan] = await db.select().from(membershipPlansTable).where(eq(membershipPlansTable.id, updated.planId)).limit(1);

  res.json({
    id: updated.id,
    memberId: updated.memberId,
    planId: updated.planId,
    planName: plan?.name ?? null,
    startDate: updated.startDate,
    endDate: updated.endDate,
    status: updated.status,
    gracePeriodDays: updated.gracePeriodDays,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
