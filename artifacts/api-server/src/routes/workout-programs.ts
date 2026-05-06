import { Router } from "express";
import { db, gymWorkoutProgramsTable, workoutLogsTable, membersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { DEFAULT_PPL_SCHEDULE } from "@workspace/db";

const router = Router();

// GET /workout-programs — list all programs for this gym
router.get("/workout-programs", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const programs = await db.select().from(gymWorkoutProgramsTable).where(eq(gymWorkoutProgramsTable.gymId, gymId));
  res.json(programs.map(p => ({
    ...p,
    schedule: JSON.parse(p.schedule),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  })));
});

// POST /workout-programs — create a new program (admin only)
router.post("/workout-programs", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const { name, description, schedule, useDefault } = req.body;

  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const resolvedSchedule = useDefault
    ? DEFAULT_PPL_SCHEDULE
    : (schedule ?? DEFAULT_PPL_SCHEDULE);

  // First program created for a gym auto-activates
  const existing = await db.select({ id: gymWorkoutProgramsTable.id })
    .from(gymWorkoutProgramsTable)
    .where(eq(gymWorkoutProgramsTable.gymId, gymId));
  const shouldAutoActivate = existing.length === 0;

  const [program] = await db.insert(gymWorkoutProgramsTable).values({
    gymId,
    name,
    description: description ?? null,
    isActive: shouldAutoActivate,
    schedule: JSON.stringify(resolvedSchedule),
  }).returning();

  res.status(201).json({
    ...program,
    schedule: JSON.parse(program.schedule),
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString(),
  });
});

// PATCH /workout-programs/:id — update program details (admin only)
router.patch("/workout-programs/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid program ID" }); return; }

  const { name, description, schedule } = req.body;
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (schedule !== undefined) updateData.schedule = JSON.stringify(schedule);

  const [updated] = await db.update(gymWorkoutProgramsTable)
    .set(updateData)
    .where(and(eq(gymWorkoutProgramsTable.id, id), eq(gymWorkoutProgramsTable.gymId, gymId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Program not found" }); return; }

  res.json({
    ...updated,
    schedule: JSON.parse(updated.schedule),
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// PATCH /workout-programs/:id/activate — set this as the gym's active program
router.patch("/workout-programs/:id/activate", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid program ID" }); return; }

  // Deactivate all programs for this gym first
  await db.update(gymWorkoutProgramsTable)
    .set({ isActive: false })
    .where(eq(gymWorkoutProgramsTable.gymId, gymId));

  // Activate the target
  const [activated] = await db.update(gymWorkoutProgramsTable)
    .set({ isActive: true })
    .where(and(eq(gymWorkoutProgramsTable.id, id), eq(gymWorkoutProgramsTable.gymId, gymId)))
    .returning();

  if (!activated) { res.status(404).json({ error: "Program not found" }); return; }

  res.json({
    ...activated,
    schedule: JSON.parse(activated.schedule),
    createdAt: activated.createdAt.toISOString(),
    updatedAt: activated.updatedAt.toISOString(),
  });
});

// DELETE /workout-programs/:id
router.delete("/workout-programs/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid program ID" }); return; }

  const [deleted] = await db.delete(gymWorkoutProgramsTable)
    .where(and(eq(gymWorkoutProgramsTable.id, id), eq(gymWorkoutProgramsTable.gymId, gymId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Program not found" }); return; }
  res.sendStatus(204);
});

export default router;
