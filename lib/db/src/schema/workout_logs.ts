import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";
import { gymsTable } from "./gyms";

export const workoutLogsTable = pgTable("workout_logs", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => membersTable.id),
  gymId: integer("gym_id").notNull().references(() => gymsTable.id),
  workoutDate: text("workout_date").notNull(), // YYYY-MM-DD
  muscleGroups: text("muscle_groups").notNull(), // comma-separated: "chest,triceps"
  exercises: text("exercises").notNull(), // JSON string: [{name, sets, reps, done}]
  notes: text("notes"),
  loggedBy: text("logged_by", { enum: ["admin", "member"] }).notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkoutLogSchema = createInsertSchema(workoutLogsTable).omit({ id: true, createdAt: true });
export type InsertWorkoutLog = z.infer<typeof insertWorkoutLogSchema>;
export type WorkoutLog = typeof workoutLogsTable.$inferSelect;
