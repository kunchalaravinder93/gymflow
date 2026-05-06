import { Router, type Request, type Response, type NextFunction } from "express";
import { db, gymsTable, usersTable, membersTable, saasSubscriptionsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";

const router = Router();

const SUPERADMIN_SECRET = process.env.SUPERADMIN_SECRET || "gymflow-superadmin-secret";

function requireSuperadmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const secret = auth.slice(7);
  if (secret !== SUPERADMIN_SECRET) {
    res.status(401).json({ error: "Invalid superadmin secret" });
    return;
  }
  next();
}

router.get("/superadmin/stats", requireSuperadmin, async (_req, res): Promise<void> => {
  const [totalGyms] = await db.select({ count: count() }).from(gymsTable);
  const [activeGyms] = await db.select({ count: count() }).from(gymsTable).where(eq(gymsTable.isActive, true));
  const [totalMembers] = await db.select({ count: count() }).from(membersTable);
  const [activeMembers] = await db.select({ count: count() }).from(membersTable).where(eq(membersTable.membershipStatus, "active"));

  const subs = await db.select().from(saasSubscriptionsTable);
  const totalRevenue = subs.reduce((sum, s) => sum + Number(s.amount ?? 0), 0);
  const activeSubs = subs.filter(s => s.status === "active").length;
  const trialSubs = subs.filter(s => s.status === "trial").length;

  res.json({
    totalGyms: Number(totalGyms.count),
    activeGyms: Number(activeGyms.count),
    totalMembers: Number(totalMembers.count),
    activeMembers: Number(activeMembers.count),
    totalRevenue,
    activeSubs,
    trialSubs,
  });
});

router.get("/superadmin/gyms", requireSuperadmin, async (_req, res): Promise<void> => {
  const gyms = await db.select().from(gymsTable).orderBy(sql`${gymsTable.createdAt} DESC`);

  const result = await Promise.all(gyms.map(async (gym) => {
    const [memberCount] = await db.select({ count: count() }).from(membersTable).where(eq(membersTable.gymId, gym.id));
    const [activeCount] = await db.select({ count: count() }).from(membersTable).where(
      sql`${membersTable.gymId} = ${gym.id} AND ${membersTable.membershipStatus} = 'active'`
    );
    const [staffCount] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.gymId, gym.id));

    const subs = await db.select().from(saasSubscriptionsTable).where(eq(saasSubscriptionsTable.gymId, gym.id));
    const latestSub = subs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const totalPaid = subs.reduce((sum, s) => sum + Number(s.amount ?? 0), 0);

    return {
      id: gym.id,
      name: gym.name,
      email: gym.email,
      phone: gym.phone,
      address: gym.address,
      isActive: gym.isActive,
      createdAt: gym.createdAt,
      totalMembers: Number(memberCount.count),
      activeMembers: Number(activeCount.count),
      staffCount: Number(staffCount.count),
      saasSubscription: latestSub ? {
        id: latestSub.id,
        plan: latestSub.plan,
        status: latestSub.status,
        amount: latestSub.amount,
        startDate: latestSub.startDate,
        endDate: latestSub.endDate,
        notes: latestSub.notes,
      } : null,
      totalPaid,
    };
  }));

  res.json(result);
});

router.get("/superadmin/gyms/:id", requireSuperadmin, async (req, res): Promise<void> => {
  const gymId = parseInt(req.params.id, 10);
  const [gym] = await db.select().from(gymsTable).where(eq(gymsTable.id, gymId));
  if (!gym) { res.status(404).json({ error: "Gym not found" }); return; }

  const subs = await db.select().from(saasSubscriptionsTable).where(eq(saasSubscriptionsTable.gymId, gymId))
    .orderBy(sql`${saasSubscriptionsTable.createdAt} DESC`);

  const [memberCount] = await db.select({ count: count() }).from(membersTable).where(eq(membersTable.gymId, gymId));
  const staff = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, isActive: usersTable.isActive }).from(usersTable).where(eq(usersTable.gymId, gymId));

  res.json({
    ...gym,
    totalMembers: Number(memberCount.count),
    staff,
    subscriptions: subs,
    totalPaid: subs.reduce((sum, s) => sum + Number(s.amount ?? 0), 0),
  });
});

router.patch("/superadmin/gyms/:id/subscription", requireSuperadmin, async (req, res): Promise<void> => {
  const gymId = parseInt(req.params.id, 10);
  const { plan, status, amount, startDate, endDate, notes } = req.body;

  const today = new Date().toISOString().split("T")[0];
  const existing = await db.select().from(saasSubscriptionsTable).where(eq(saasSubscriptionsTable.gymId, gymId));

  if (existing.length > 0) {
    const [updated] = await db.update(saasSubscriptionsTable)
      .set({
        plan: plan ?? existing[0].plan,
        status: status ?? existing[0].status,
        amount: amount != null ? String(amount) : existing[0].amount,
        startDate: startDate ?? existing[0].startDate,
        endDate: endDate ?? existing[0].endDate,
        notes: notes ?? existing[0].notes,
      })
      .where(eq(saasSubscriptionsTable.id, existing[0].id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(saasSubscriptionsTable).values({
      gymId,
      plan: plan ?? "trial",
      status: status ?? "trial",
      amount: amount != null ? String(amount) : null,
      startDate: startDate ?? today,
      endDate: endDate ?? null,
      notes: notes ?? null,
    }).returning();
    res.json(created);
  }
});

router.patch("/superadmin/gyms/:id/toggle-active", requireSuperadmin, async (req, res): Promise<void> => {
  const gymId = parseInt(req.params.id, 10);
  const [gym] = await db.select().from(gymsTable).where(eq(gymsTable.id, gymId));
  if (!gym) { res.status(404).json({ error: "Gym not found" }); return; }

  const [updated] = await db.update(gymsTable).set({ isActive: !gym.isActive }).where(eq(gymsTable.id, gymId)).returning();
  res.json(updated);
});

export default router;
