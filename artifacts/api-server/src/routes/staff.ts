import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import {
  CreateStaffBody,
  UpdateStaffBody,
  UpdateStaffParams,
  DeleteStaffParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/staff", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;

  const staff = await db
    .select({
      id: usersTable.id,
      gymId: usersTable.gymId,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.gymId, gymId))
    .orderBy(usersTable.createdAt);

  res.json(staff.map(s => ({
    id: s.id,
    gymId: s.gymId,
    name: s.name,
    email: s.email,
    phone: s.phone ?? null,
    role: s.role,
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.post("/staff", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email)).limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const [user] = await db.insert(usersTable).values({
    gymId,
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash,
    phone: parsed.data.phone ?? null,
    role: parsed.data.role,
  }).returning();

  res.status(201).json({
    id: user.id,
    gymId: user.gymId,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  });
});

router.patch("/staff/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = UpdateStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid staff ID" });
    return;
  }

  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set(parsed.data)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.gymId, gymId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }

  res.json({
    id: updated.id,
    gymId: updated.gymId,
    name: updated.name,
    email: updated.email,
    phone: updated.phone ?? null,
    role: updated.role,
    isActive: updated.isActive,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/staff/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = DeleteStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid staff ID" });
    return;
  }

  // Don't allow deleting yourself
  if (params.data.id === req.user!.userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  const [deleted] = await db.delete(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.gymId, gymId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
