import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const checkinsTable = pgTable("checkins", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => membersTable.id),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status", { enum: ["allowed", "denied"] }).notNull().default("allowed"),
  deniedReason: text("denied_reason"),
});

export const insertCheckinSchema = createInsertSchema(checkinsTable).omit({ id: true, checkedInAt: true });
export type InsertCheckin = z.infer<typeof insertCheckinSchema>;
export type Checkin = typeof checkinsTable.$inferSelect;
