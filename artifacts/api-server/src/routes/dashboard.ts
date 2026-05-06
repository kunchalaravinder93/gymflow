import { Router } from "express";
import { db, membersTable, paymentsTable, checkinsTable, membershipPlansTable } from "@workspace/db";
import { eq, and, gte, lte, sql, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const today = new Date().toISOString().split("T")[0];
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [totalRow] = await db.select({ count: count() }).from(membersTable).where(eq(membersTable.gymId, gymId));
  const [activeRow] = await db.select({ count: count() }).from(membersTable).where(and(eq(membersTable.gymId, gymId), eq(membersTable.membershipStatus, "active")));
  const [expiredRow] = await db.select({ count: count() }).from(membersTable).where(and(eq(membersTable.gymId, gymId), eq(membersTable.membershipStatus, "expired")));
  const [pendingRow] = await db.select({ count: count() }).from(membersTable).where(and(eq(membersTable.gymId, gymId), eq(membersTable.membershipStatus, "pending")));

  // Today's check-ins
  const todayStart = today + "T00:00:00.000Z";
  const todayEnd = today + "T23:59:59.999Z";
  const gymMemberIds = await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.gymId, gymId));
  const memberIdList = gymMemberIds.map(m => m.id);

  let todayCheckins = 0;
  if (memberIdList.length > 0) {
    const [checkRow] = await db.select({ count: count() }).from(checkinsTable).where(
      and(
        sql`${checkinsTable.memberId} = ANY(${sql.raw(`ARRAY[${memberIdList.join(",")}]`)})`,
        gte(checkinsTable.checkedInAt, new Date(todayStart)),
        lte(checkinsTable.checkedInAt, new Date(todayEnd))
      )
    );
    todayCheckins = Number(checkRow?.count ?? 0);
  }

  // Expiring this week
  const [expiringRow] = await db.select({ count: count() }).from(membersTable).where(
    and(
      eq(membersTable.gymId, gymId),
      eq(membersTable.membershipStatus, "active"),
      gte(membersTable.endDate, today),
      lte(membersTable.endDate, in7Days)
    )
  );

  // Revenue
  let totalRevenue = 0;
  let monthRevenue = 0;
  if (memberIdList.length > 0) {
    const allPayments = await db.select({ amount: paymentsTable.amount, paidAt: paymentsTable.paidAt }).from(paymentsTable).where(
      sql`${paymentsTable.memberId} = ANY(${sql.raw(`ARRAY[${memberIdList.join(",")}]`)})`
    );
    totalRevenue = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    monthRevenue = allPayments
      .filter(p => p.paidAt >= startOfMonth)
      .reduce((sum, p) => sum + Number(p.amount), 0);
  }

  res.json({
    totalMembers: Number(totalRow?.count ?? 0),
    activeMembers: Number(activeRow?.count ?? 0),
    expiredMembers: Number(expiredRow?.count ?? 0),
    pendingMembers: Number(pendingRow?.count ?? 0),
    todayCheckins,
    expiringThisWeek: Number(expiringRow?.count ?? 0),
    totalRevenue,
    monthRevenue,
  });
});

router.get("/dashboard/upcoming-expiries", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const today = new Date().toISOString().split("T")[0];
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const members = await db
    .select({
      id: membersTable.id,
      name: membersTable.name,
      email: membersTable.email,
      phone: membersTable.phone,
      endDate: membersTable.endDate,
      membershipStatus: membersTable.membershipStatus,
      planName: membershipPlansTable.name,
    })
    .from(membersTable)
    .leftJoin(membershipPlansTable, eq(membersTable.planId, membershipPlansTable.id))
    .where(
      and(
        eq(membersTable.gymId, gymId),
        gte(membersTable.endDate, today),
        lte(membersTable.endDate, in7Days)
      )
    )
    .orderBy(membersTable.endDate);

  const result = members.map(m => {
    const expiry = new Date(m.endDate!);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      memberId: m.id,
      memberName: m.name,
      email: m.email,
      phone: m.phone ?? null,
      planName: m.planName ?? "No Plan",
      expiryDate: m.endDate!,
      daysUntilExpiry,
      status: m.membershipStatus,
    };
  });

  res.json(result);
});

router.get("/dashboard/recent-checkins", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;

  const gymMemberIds = await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.gymId, gymId));
  const memberIdList = gymMemberIds.map(m => m.id);

  if (memberIdList.length === 0) {
    res.json([]);
    return;
  }

  const checkins = await db
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
    .where(sql`${checkinsTable.memberId} = ANY(${sql.raw(`ARRAY[${memberIdList.join(",")}]`)})`)
    .orderBy(sql`${checkinsTable.checkedInAt} DESC`)
    .limit(20);

  res.json(checkins.map(c => ({
    id: c.id,
    memberId: c.memberId,
    memberName: c.memberName ?? null,
    memberPhoto: c.memberPhoto ?? null,
    checkedInAt: c.checkedInAt.toISOString(),
    status: c.status,
    deniedReason: c.deniedReason ?? null,
  })));
});

router.get("/dashboard/revenue", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;

  const gymMemberIds = await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.gymId, gymId));
  const memberIdList = gymMemberIds.map(m => m.id);

  if (memberIdList.length === 0) {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push({ month: d.toISOString().slice(0, 7), revenue: 0, paymentCount: 0 });
    }
    res.json(months);
    return;
  }

  const payments = await db
    .select({ amount: paymentsTable.amount, paidAt: paymentsTable.paidAt })
    .from(paymentsTable)
    .where(sql`${paymentsTable.memberId} = ANY(${sql.raw(`ARRAY[${memberIdList.join(",")}]`)})`);

  const monthMap: Record<string, { revenue: number; count: number }> = {};

  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    monthMap[key] = { revenue: 0, count: 0 };
  }

  for (const p of payments) {
    const monthKey = p.paidAt.slice(0, 7);
    if (monthMap[monthKey]) {
      monthMap[monthKey].revenue += Number(p.amount);
      monthMap[monthKey].count += 1;
    }
  }

  const result = Object.entries(monthMap).map(([month, data]) => ({
    month,
    revenue: data.revenue,
    paymentCount: data.count,
  }));

  res.json(result);
});

export default router;
