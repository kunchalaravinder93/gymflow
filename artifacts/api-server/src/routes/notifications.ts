import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  MarkNotificationReadParams,
  ListNotificationsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const query = ListNotificationsQueryParams.safeParse(req.query);
  const { unreadOnly } = query.success ? query.data : {};

  let rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.gymId, gymId))
    .orderBy(notificationsTable.createdAt);

  rows = rows.reverse(); // Most recent first

  if (unreadOnly) {
    rows = rows.filter(n => !n.isRead);
  }

  res.json(rows.map(n => ({
    id: n.id,
    gymId: n.gymId,
    memberId: n.memberId ?? null,
    memberName: null,
    type: n.type,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  })));
});

router.get("/notifications/unread-count", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;

  const [row] = await db
    .select({ count: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.gymId, gymId), eq(notificationsTable.isRead, false)));

  res.json({ count: Number(row?.count ?? 0) });
});

router.post("/notifications/mark-all-read", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;

  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.gymId, gymId));

  res.json({ success: true });
});

router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const gymId = req.user!.gymId;
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid notification ID" });
    return;
  }

  const [updated] = await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.gymId, gymId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json({
    id: updated.id,
    gymId: updated.gymId,
    memberId: updated.memberId ?? null,
    memberName: null,
    type: updated.type,
    title: updated.title,
    message: updated.message,
    isRead: updated.isRead,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
