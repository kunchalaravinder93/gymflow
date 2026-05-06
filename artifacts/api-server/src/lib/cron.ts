import cron from "node-cron";
import { db, membersTable, notificationsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { logger } from "./logger";

export function startCronJobs(): void {
  // Run daily at 8am — check for expiring and expired memberships
  cron.schedule("0 8 * * *", async () => {
    logger.info("Running daily membership expiry check");
    await runExpiryCheck();
  });

  logger.info("Cron jobs started");
}

export async function runExpiryCheck(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Find members expiring in exactly 7 days
  const expiring7 = await db
    .select()
    .from(membersTable)
    .where(and(eq(membersTable.membershipStatus, "active"), eq(membersTable.endDate, in7Days)));

  for (const member of expiring7) {
    // Check if notification already sent today
    const existing = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.gymId, member.gymId),
          eq(notificationsTable.memberId, member.id),
          eq(notificationsTable.type, "expiry_7days"),
          sql`DATE(${notificationsTable.createdAt}) = CURRENT_DATE`
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(notificationsTable).values({
        gymId: member.gymId,
        memberId: member.id,
        type: "expiry_7days",
        title: "Membership Expiring in 7 Days",
        message: `${member.name}'s membership expires on ${member.endDate}. Please remind them to renew.`,
        isRead: false,
      });
      logger.info({ memberId: member.id, name: member.name }, "7-day expiry notification created");
    }
  }

  // Find members expiring in exactly 3 days
  const expiring3 = await db
    .select()
    .from(membersTable)
    .where(and(eq(membersTable.membershipStatus, "active"), eq(membersTable.endDate, in3Days)));

  for (const member of expiring3) {
    const existing = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.gymId, member.gymId),
          eq(notificationsTable.memberId, member.id),
          eq(notificationsTable.type, "expiry_3days"),
          sql`DATE(${notificationsTable.createdAt}) = CURRENT_DATE`
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(notificationsTable).values({
        gymId: member.gymId,
        memberId: member.id,
        type: "expiry_3days",
        title: "Membership Expiring in 3 Days",
        message: `${member.name}'s membership expires on ${member.endDate}. Urgent: please contact them to renew.`,
        isRead: false,
      });
      logger.info({ memberId: member.id, name: member.name }, "3-day expiry notification created");
    }
  }

  // Find members whose membership expired today — mark as expired
  const expiredToday = await db
    .select()
    .from(membersTable)
    .where(and(eq(membersTable.membershipStatus, "active"), lte(membersTable.endDate, today)));

  for (const member of expiredToday) {
    await db
      .update(membersTable)
      .set({ membershipStatus: "expired" })
      .where(eq(membersTable.id, member.id));

    const existing = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.gymId, member.gymId),
          eq(notificationsTable.memberId, member.id),
          eq(notificationsTable.type, "expired"),
          sql`DATE(${notificationsTable.createdAt}) = CURRENT_DATE`
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(notificationsTable).values({
        gymId: member.gymId,
        memberId: member.id,
        type: "expired",
        title: "Membership Expired",
        message: `${member.name}'s membership has expired as of ${member.endDate}. Access has been restricted.`,
        isRead: false,
      });
      logger.info({ memberId: member.id, name: member.name }, "Expired notification created");
    }
  }

  logger.info(
    { expiring7: expiring7.length, expiring3: expiring3.length, expiredToday: expiredToday.length },
    "Expiry check complete"
  );
}
