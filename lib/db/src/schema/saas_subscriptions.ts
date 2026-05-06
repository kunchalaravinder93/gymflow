import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gymsTable } from "./gyms";

export const saasSubscriptionsTable = pgTable("saas_subscriptions", {
  id: serial("id").primaryKey(),
  gymId: integer("gym_id").notNull().references(() => gymsTable.id),
  plan: text("plan", { enum: ["trial", "starter", "growth", "pro"] }).notNull().default("trial"),
  status: text("status", { enum: ["active", "expired", "cancelled", "trial"] }).notNull().default("trial"),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSaasSubscriptionSchema = createInsertSchema(saasSubscriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSaasSubscription = z.infer<typeof insertSaasSubscriptionSchema>;
export type SaasSubscription = typeof saasSubscriptionsTable.$inferSelect;
