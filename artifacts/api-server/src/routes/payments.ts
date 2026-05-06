import { Router } from "express";
import { db, paymentsTable, membersTable, notificationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreatePaymentBody,
  GetPaymentParams,
  ListPaymentsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const query = ListPaymentsQueryParams.safeParse(req.query);
  const { memberId } = query.success ? query.data : {};

  const gymMembers = await db.select({ id: membersTable.id, name: membersTable.name }).from(membersTable).where(eq(membersTable.gymId, gymId));
  const memberIds = gymMembers.map(m => m.id);
  const memberNameMap = Object.fromEntries(gymMembers.map(m => [m.id, m.name]));

  if (memberIds.length === 0) {
    res.json([]);
    return;
  }

  let payments = await db
    .select()
    .from(paymentsTable)
    .orderBy(paymentsTable.paidAt);

  payments = payments.filter(p => memberIds.includes(p.memberId));
  if (memberId) payments = payments.filter(p => p.memberId === memberId);

  res.json(payments.map(p => ({
    id: p.id,
    memberId: p.memberId,
    memberName: memberNameMap[p.memberId] ?? null,
    subscriptionId: p.subscriptionId ?? null,
    amount: Number(p.amount),
    method: p.method,
    notes: p.notes ?? null,
    paidAt: p.paidAt,
    createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [member] = await db.select().from(membersTable).where(and(eq(membersTable.id, parsed.data.memberId), eq(membersTable.gymId, gymId))).limit(1);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const paidAt = parsed.data.paidAt ?? new Date().toISOString().split("T")[0];

  const [payment] = await db.insert(paymentsTable).values({
    memberId: parsed.data.memberId,
    subscriptionId: parsed.data.subscriptionId ?? null,
    amount: String(parsed.data.amount),
    method: parsed.data.method,
    notes: parsed.data.notes ?? null,
    paidAt,
  }).returning();

  // Create notification
  await db.insert(notificationsTable).values({
    gymId,
    memberId: member.id,
    type: "payment_received",
    title: "Payment Received",
    message: `Payment of $${parsed.data.amount} received from ${member.name}`,
    isRead: false,
  });

  res.status(201).json({
    id: payment.id,
    memberId: payment.memberId,
    memberName: member.name,
    subscriptionId: payment.subscriptionId ?? null,
    amount: Number(payment.amount),
    method: payment.method,
    notes: payment.notes ?? null,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt.toISOString(),
  });
});

router.get("/payments/:id", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid payment ID" });
    return;
  }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id)).limit(1);
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  const [member] = await db.select().from(membersTable).where(and(eq(membersTable.id, payment.memberId), eq(membersTable.gymId, gymId))).limit(1);
  if (!member) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  res.json({
    id: payment.id,
    memberId: payment.memberId,
    memberName: member.name,
    subscriptionId: payment.subscriptionId ?? null,
    amount: Number(payment.amount),
    method: payment.method,
    notes: payment.notes ?? null,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt.toISOString(),
  });
});

export default router;
