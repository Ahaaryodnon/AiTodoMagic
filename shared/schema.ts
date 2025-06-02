import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  microsoftId: text("microsoft_id").unique(),
  title: text("title").notNull(),
  description: text("description"),
  completed: boolean("completed").default(false),
  priority: text("priority", { enum: ["low", "normal", "medium", "high"] }).default("normal"),
  dueDate: timestamp("due_date"),
  listName: text("list_name").default("Tasks"),
  aiScore: integer("ai_score").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // voice_command, task_completed, sync, ai_insight
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const voiceCommands = pgTable("voice_commands", {
  id: serial("id").primaryKey(),
  transcription: text("transcription").notNull(),
  intent: text("intent"), // add_task, update_task, complete_task, set_priority
  aiResponse: jsonb("ai_response"),
  processed: boolean("processed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
});

export const insertVoiceCommandSchema = createInsertSchema(voiceCommands).omit({
  id: true,
  createdAt: true,
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type VoiceCommand = typeof voiceCommands.$inferSelect;
export type InsertVoiceCommand = z.infer<typeof insertVoiceCommandSchema>;
