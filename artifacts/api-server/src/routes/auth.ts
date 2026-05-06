import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, gymsTable, usersTable, saasSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, signToken } from "../middlewares/auth";
import { RegisterGymBody, LoginBody } from "@workspace/api-zod";

const router = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterGymBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { gymName, ownerName, email, password, phone, address } = parsed.data;

  // Check if email already exists
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Create gym then user in sequence
  const [gym] = await db.insert(gymsTable).values({
    name: gymName,
    email,
    phone: phone ?? null,
    address: address ?? null,
  }).returning();

  const [user] = await db.insert(usersTable).values({
    gymId: gym.id,
    name: ownerName,
    email,
    passwordHash,
    role: "admin",
  }).returning();

  // Auto-create a trial SaaS subscription for the new gym
  await db.insert(saasSubscriptionsTable).values({
    gymId: gym.id,
    plan: "trial",
    status: "trial",
    startDate: new Date().toISOString().split("T")[0],
    notes: "Auto-created on gym registration",
  });

  const token = signToken({ userId: user.id, gymId: gym.id, role: user.role, email: user.email });

  res.status(201).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      gymId: gym.id,
      gymName: gym.name,
    },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const [gym] = await db.select().from(gymsTable).where(eq(gymsTable.id, user.gymId)).limit(1);

  const token = signToken({ userId: user.id, gymId: user.gymId, role: user.role, email: user.email });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      gymId: user.gymId,
      gymName: gym?.name ?? "",
    },
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [gym] = await db.select().from(gymsTable).where(eq(gymsTable.id, user.gymId)).limit(1);

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    gymId: user.gymId,
    gymName: gym?.name ?? "",
  });
});

export default router;
