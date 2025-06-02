import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
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

export const microsoftConfig = pgTable("microsoft_config", {
  id: serial("id").primaryKey(),
  clientId: text("client_id"),
  tenantId: text("tenant_id"),
  clientSecret: text("client_secret"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tasksRelations = relations(tasks, ({ many }) => ({
  activities: many(activities),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  task: one(tasks, {
    fields: [activities.id],
    references: [tasks.id],
  }),
}));

export const voiceCommandsRelations = relations(voiceCommands, ({ one }) => ({
  task: one(tasks, {
    fields: [voiceCommands.id],
    references: [tasks.id],
  }),
}));

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

export const insertMicrosoftConfigSchema = createInsertSchema(microsoftConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type VoiceCommand = typeof voiceCommands.$inferSelect;
export type InsertVoiceCommand = z.infer<typeof insertVoiceCommandSchema>;
export type MicrosoftConfig = typeof microsoftConfig.$inferSelect;
export type InsertMicrosoftConfig = z.infer<typeof insertMicrosoftConfigSchema>;
