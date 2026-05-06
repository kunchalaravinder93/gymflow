import { Router } from "express";
import { db, membershipPlansTable, membersTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreatePlanBody,
  UpdatePlanBody,
  GetPlanParams,
  UpdatePlanParams,
  DeletePlanParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/plans", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;

  const plans = await db
    .select()
    .from(membershipPlansTable)
    .where(eq(membershipPlansTable.gymId, gymId))
    .orderBy(membershipPlansTable.createdAt);

  // Get member counts per plan
  const memberCounts = await db
    .select({ planId: membersTable.planId, count: count() })
    .from(membersTable)
    .where(eq(membersTable.gymId, gymId))
    .groupBy(membersTable.planId);

  const countMap = Object.fromEntries(memberCounts.map(mc => [mc.planId, Number(mc.count)]));

  res.json(plans.map(p => ({
    id: p.id,
    gymId: p.gymId,
    name: p.name,
    description: p.description ?? null,
    price: Number(p.price),
    durationDays: p.durationDays,
    benefits: p.benefits ?? null,
    isActive: p.isActive,
    memberCount: countMap[p.id] ?? 0,
    createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/plans", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const parsed = CreatePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [plan] = await db.insert(membershipPlansTable).values({
    gymId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    price: String(parsed.data.price),
    durationDays: parsed.data.durationDays,
    benefits: parsed.data.benefits ?? null,
    isActive: parsed.data.isActive ?? true,
  }).returning();

  res.status(201).json({
    id: plan.id,
    gymId: plan.gymId,
    name: plan.name,
    description: plan.description ?? null,
    price: Number(plan.price),
    durationDays: plan.durationDays,
    benefits: plan.benefits ?? null,
    isActive: plan.isActive,
    memberCount: 0,
    createdAt: plan.createdAt.toISOString(),
  });
});

router.get("/plans/:id", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = GetPlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }

  const [plan] = await db
    .select()
    .from(membershipPlansTable)
    .where(and(eq(membershipPlansTable.id, params.data.id), eq(membershipPlansTable.gymId, gymId)))
    .limit(1);

  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const [mc] = await db.select({ count: count() }).from(membersTable).where(and(eq(membersTable.gymId, gymId), eq(membersTable.planId, plan.id)));

  res.json({
    id: plan.id,
    gymId: plan.gymId,
    name: plan.name,
    description: plan.description ?? null,
    price: Number(plan.price),
    durationDays: plan.durationDays,
    benefits: plan.benefits ?? null,
    isActive: plan.isActive,
    memberCount: Number(mc?.count ?? 0),
    createdAt: plan.createdAt.toISOString(),
  });
});

router.patch("/plans/:id", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = UpdatePlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }

  const parsed = UpdatePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.price !== undefined) updateData.price = String(parsed.data.price);
  if (parsed.data.durationDays !== undefined) updateData.durationDays = parsed.data.durationDays;
  if (parsed.data.benefits !== undefined) updateData.benefits = parsed.data.benefits;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

  const [updated] = await db.update(membershipPlansTable)
    .set(updateData)
    .where(and(eq(membershipPlansTable.id, params.data.id), eq(membershipPlansTable.gymId, gymId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const [mc] = await db.select({ count: count() }).from(membersTable).where(and(eq(membersTable.gymId, gymId), eq(membersTable.planId, updated.id)));

  res.json({
    id: updated.id,
    gymId: updated.gymId,
    name: updated.name,
    description: updated.description ?? null,
    price: Number(updated.price),
    durationDays: updated.durationDays,
    benefits: updated.benefits ?? null,
    isActive: updated.isActive,
    memberCount: Number(mc?.count ?? 0),
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/plans/:id", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = DeletePlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }

  const [deleted] = await db.delete(membershipPlansTable)
    .where(and(eq(membershipPlansTable.id, params.data.id), eq(membershipPlansTable.gymId, gymId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
