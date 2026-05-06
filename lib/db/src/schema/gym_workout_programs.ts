import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gymsTable } from "./gyms";

// A workout program has a name + a JSON-encoded 7-day schedule
// schedule shape: Array<{
//   day: 0-6 (0=Mon … 6=Sun),
//   label: string,           e.g. "Push Day"
//   muscleGroups: string[],  e.g. ["chest","triceps","shoulders"]
//   exercises: Array<{ name: string, sets: number, reps: string }>,
//   isRest: boolean
// }>

export const gymWorkoutProgramsTable = pgTable("gym_workout_programs", {
  id: serial("id").primaryKey(),
  gymId: integer("gym_id").notNull().references(() => gymsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(false),
  schedule: text("schedule").notNull(), // JSON string of 7-day array
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGymWorkoutProgramSchema = createInsertSchema(gymWorkoutProgramsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGymWorkoutProgram = z.infer<typeof insertGymWorkoutProgramSchema>;
export type GymWorkoutProgram = typeof gymWorkoutProgramsTable.$inferSelect;

// ---- Default PPL template used when a gym creates their first program ----
export const DEFAULT_PPL_SCHEDULE = [
  {
    day: 0, label: "Push Day", isRest: false,
    muscleGroups: ["chest", "shoulders", "triceps"],
    exercises: [
      { name: "Bench Press", sets: 4, reps: "8-10" },
      { name: "Overhead Press", sets: 3, reps: "10-12" },
      { name: "Incline Dumbbell Press", sets: 3, reps: "10-12" },
      { name: "Lateral Raises", sets: 3, reps: "15-20" },
      { name: "Tricep Pushdowns", sets: 3, reps: "12-15" },
    ],
  },
  {
    day: 1, label: "Pull Day", isRest: false,
    muscleGroups: ["back", "biceps"],
    exercises: [
      { name: "Pull-Ups / Lat Pulldown", sets: 4, reps: "8-10" },
      { name: "Barbell Row", sets: 4, reps: "8-10" },
      { name: "Seated Cable Row", sets: 3, reps: "10-12" },
      { name: "Face Pulls", sets: 3, reps: "15-20" },
      { name: "Barbell Curl", sets: 3, reps: "10-12" },
    ],
  },
  {
    day: 2, label: "Legs Day", isRest: false,
    muscleGroups: ["quads", "hamstrings", "glutes", "calves"],
    exercises: [
      { name: "Barbell Squat", sets: 4, reps: "6-8" },
      { name: "Romanian Deadlift", sets: 3, reps: "10-12" },
      { name: "Leg Press", sets: 3, reps: "12-15" },
      { name: "Leg Curl", sets: 3, reps: "12-15" },
      { name: "Standing Calf Raise", sets: 4, reps: "15-20" },
    ],
  },
  {
    day: 3, label: "Rest / Active Recovery", isRest: true,
    muscleGroups: [],
    exercises: [],
  },
  {
    day: 4, label: "Push Day", isRest: false,
    muscleGroups: ["chest", "shoulders", "triceps"],
    exercises: [
      { name: "Incline Bench Press", sets: 4, reps: "8-10" },
      { name: "Dumbbell Shoulder Press", sets: 3, reps: "10-12" },
      { name: "Cable Fly", sets: 3, reps: "12-15" },
      { name: "Arnold Press", sets: 3, reps: "10-12" },
      { name: "Skull Crushers", sets: 3, reps: "10-12" },
    ],
  },
  {
    day: 5, label: "Pull Day", isRest: false,
    muscleGroups: ["back", "biceps", "rear delts"],
    exercises: [
      { name: "Deadlift", sets: 4, reps: "5" },
      { name: "T-Bar Row", sets: 3, reps: "10-12" },
      { name: "Single-Arm Dumbbell Row", sets: 3, reps: "10-12" },
      { name: "Hammer Curl", sets: 3, reps: "10-12" },
      { name: "Reverse Fly", sets: 3, reps: "15-20" },
    ],
  },
  {
    day: 6, label: "Rest / Active Recovery", isRest: true,
    muscleGroups: [],
    exercises: [],
  },
];
