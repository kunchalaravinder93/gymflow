import { Router } from "express";
import { db, membersTable, membershipPlansTable, subscriptionsTable, paymentsTable, checkinsTable, notificationsTable } from "@workspace/db";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateMemberBody,
  UpdateMemberBody,
  GetMemberParams,
  UpdateMemberParams,
  DeleteMemberParams,
  CheckInMemberParams,
  ListMembersQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/members", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const query = ListMembersQueryParams.safeParse(req.query);
  const { status, search, planId } = query.success ? query.data : {};

  let rows = await db
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
    .where(eq(membersTable.gymId, gymId))
    .orderBy(membersTable.createdAt);

  if (status) {
    rows = rows.filter(r => r.membershipStatus === status);
  }
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(r => r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s) || (r.phone?.toLowerCase().includes(s)));
  }
  if (planId) {
    rows = rows.filter(r => r.planId === planId);
  }

  res.json(rows.map(r => ({
    ...r,
    planName: r.planName ?? null,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/members", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const parsed = CreateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, phone, profilePhoto, planId, startDate } = parsed.data;

  let endDate: string | null = null;
  if (planId && startDate) {
    const [plan] = await db.select().from(membershipPlansTable).where(eq(membershipPlansTable.id, planId)).limit(1);
    if (plan) {
      const start = new Date(startDate);
      start.setDate(start.getDate() + plan.durationDays);
      endDate = start.toISOString().split("T")[0];
    }
  }

  const [member] = await db.insert(membersTable).values({
    gymId,
    name,
    email,
    phone: phone ?? null,
    profilePhoto: profilePhoto ?? null,
    planId: planId ?? null,
    membershipStatus: planId && startDate ? "active" : "pending",
    startDate: startDate ?? null,
    endDate,
  }).returning();

  // Create subscription if plan and start date provided
  if (planId && startDate && endDate) {
    await db.insert(subscriptionsTable).values({
      memberId: member.id,
      planId,
      startDate,
      endDate,
      status: "active",
      gracePeriodDays: 0,
    });
  }

  const [plan] = planId
    ? await db.select().from(membershipPlansTable).where(eq(membershipPlansTable.id, planId)).limit(1)
    : [null];

  res.status(201).json({
    id: member.id,
    gymId: member.gymId,
    name: member.name,
    email: member.email,
    phone: member.phone ?? null,
    profilePhoto: member.profilePhoto ?? null,
    membershipStatus: member.membershipStatus,
    planId: member.planId ?? null,
    planName: plan?.name ?? null,
    startDate: member.startDate ?? null,
    endDate: member.endDate ?? null,
    createdAt: member.createdAt.toISOString(),
  });
});

router.get("/members/export", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;

  const members = await db
    .select({
      id: membersTable.id,
      name: membersTable.name,
      email: membersTable.email,
      phone: membersTable.phone,
      membershipStatus: membersTable.membershipStatus,
      planName: membershipPlansTable.name,
      startDate: membersTable.startDate,
      endDate: membersTable.endDate,
      createdAt: membersTable.createdAt,
    })
    .from(membersTable)
    .leftJoin(membershipPlansTable, eq(membersTable.planId, membershipPlansTable.id))
    .where(eq(membersTable.gymId, gymId))
    .orderBy(membersTable.createdAt);

  const header = "ID,Name,Email,Phone,Status,Plan,Start Date,End Date,Joined\n";
  const rows = members.map(m =>
    [m.id, `"${m.name}"`, m.email, m.phone ?? "", m.membershipStatus, m.planName ?? "", m.startDate ?? "", m.endDate ?? "", m.createdAt.toISOString().split("T")[0]].join(",")
  ).join("\n");

  const csv = header + rows;
  const filename = `members_${new Date().toISOString().split("T")[0]}.csv`;

  res.json({ csv, filename });
});

router.get("/members/:id", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = GetMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid member ID" });
    return;
  }

  const [member] = await db
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
    .where(and(eq(membersTable.id, params.data.id), eq(membersTable.gymId, gymId)))
    .limit(1);

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const subs = await db
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
    .where(eq(subscriptionsTable.memberId, member.id))
    .orderBy(subscriptionsTable.createdAt);

  const pays = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.memberId, member.id))
    .orderBy(paymentsTable.paidAt);

  const chks = await db
    .select()
    .from(checkinsTable)
    .where(eq(checkinsTable.memberId, member.id))
    .orderBy(sql`${checkinsTable.checkedInAt} DESC`)
    .limit(20);

  res.json({
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
    subscriptions: subs.map(s => ({ ...s, planName: s.planName ?? null, createdAt: s.createdAt.toISOString() })),
    payments: pays.map(p => ({ ...p, amount: Number(p.amount), memberName: null, createdAt: p.createdAt.toISOString() })),
    checkins: chks.map(c => ({ ...c, memberName: member.name, memberPhoto: member.profilePhoto ?? null, checkedInAt: c.checkedInAt.toISOString() })),
  });
});

router.patch("/members/:id", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = UpdateMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid member ID" });
    return;
  }

  const parsed = UpdateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { planId, startDate, endDate, ...rest } = parsed.data;

  // If planId changes and no endDate provided, compute it
  let computedEndDate = endDate;
  if (planId && startDate && !endDate) {
    const [plan] = await db.select().from(membershipPlansTable).where(eq(membershipPlansTable.id, planId)).limit(1);
    if (plan) {
      const start = new Date(startDate);
      start.setDate(start.getDate() + plan.durationDays);
      computedEndDate = start.toISOString().split("T")[0];
    }
  }

  const updateData: Record<string, unknown> = { ...rest };
  if (planId !== undefined) updateData.planId = planId;
  if (startDate !== undefined) updateData.startDate = startDate;
  if (computedEndDate !== undefined) updateData.endDate = computedEndDate;

  const [updated] = await db.update(membersTable)
    .set(updateData)
    .where(and(eq(membersTable.id, params.data.id), eq(membersTable.gymId, gymId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const [plan] = updated.planId
    ? await db.select().from(membershipPlansTable).where(eq(membershipPlansTable.id, updated.planId)).limit(1)
    : [null];

  res.json({
    id: updated.id,
    gymId: updated.gymId,
    name: updated.name,
    email: updated.email,
    phone: updated.phone ?? null,
    profilePhoto: updated.profilePhoto ?? null,
    membershipStatus: updated.membershipStatus,
    planId: updated.planId ?? null,
    planName: plan?.name ?? null,
    startDate: updated.startDate ?? null,
    endDate: updated.endDate ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/members/:id", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = DeleteMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid member ID" });
    return;
  }

  const [deleted] = await db.delete(membersTable)
    .where(and(eq(membersTable.id, params.data.id), eq(membersTable.gymId, gymId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/members/:id/renew", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const memberId = parseInt(req.params.id);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid member ID" }); return; }

  const { planId, amount, paymentMethod, startDate } = req.body;
  if (!planId || !amount) { res.status(400).json({ error: "planId and amount are required" }); return; }

  const [member] = await db.select().from(membersTable)
    .where(and(eq(membersTable.id, memberId), eq(membersTable.gymId, gymId))).limit(1);
  if (!member) { res.status(404).json({ error: "Member not found" }); return; }

  const [plan] = await db.select().from(membershipPlansTable)
    .where(eq(membershipPlansTable.id, planId)).limit(1);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const start = new Date(startDate || new Date().toISOString().split("T")[0]);
  const end = new Date(start);
  end.setDate(end.getDate() + plan.durationDays);
  const newStartDate = start.toISOString().split("T")[0];
  const newEndDate = end.toISOString().split("T")[0];

  const [updated] = await db.update(membersTable).set({
    planId,
    membershipStatus: "active",
    startDate: newStartDate,
    endDate: newEndDate,
  }).where(and(eq(membersTable.id, memberId), eq(membersTable.gymId, gymId))).returning();

  await db.insert(subscriptionsTable).values({
    memberId,
    planId,
    startDate: newStartDate,
    endDate: newEndDate,
    status: "active",
    gracePeriodDays: 0,
  });

  await db.insert(paymentsTable).values({
    memberId,
    amount: String(amount),
    method: (paymentMethod ?? "cash") as "cash" | "card" | "upi" | "bank_transfer" | "other",
    paidAt: newStartDate,
    notes: `Renewal — ${plan.name}`,
  });

  // Clear any expiry notifications for this member
  await db.delete(notificationsTable)
    .where(and(eq(notificationsTable.memberId, memberId), eq(notificationsTable.gymId, gymId)));

  res.json({
    id: updated.id,
    gymId: updated.gymId,
    name: updated.name,
    email: updated.email,
    phone: updated.phone ?? null,
    profilePhoto: updated.profilePhoto ?? null,
    membershipStatus: updated.membershipStatus,
    planId: updated.planId ?? null,
    planName: plan.name,
    startDate: updated.startDate ?? null,
    endDate: updated.endDate ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.post("/members/:id/checkin", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = CheckInMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid member ID" });
    return;
  }

  const [member] = await db
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
    .where(and(eq(membersTable.id, params.data.id), eq(membersTable.gymId, gymId)))
    .limit(1);

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
    message: allowed ? "Check-in successful" : `Check-in denied: ${deniedReason}`,
  });
});

export default router;
