import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gymsTable } from "./gyms";
import { membershipPlansTable } from "./membership_plans";

export const membersTable = pgTable("members", {
  id: serial("id").primaryKey(),
  gymId: integer("gym_id").notNull().references(() => gymsTable.id),
  planId: integer("plan_id").references(() => membershipPlansTable.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  profilePhoto: text("profile_photo"),
  membershipStatus: text("membership_status", { enum: ["active", "expired", "pending"] }).notNull().default("pending"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMemberSchema = createInsertSchema(membersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
