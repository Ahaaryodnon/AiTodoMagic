import { tasks, activities, voiceCommands, type Task, type InsertTask, type Activity, type InsertActivity, type VoiceCommand, type InsertVoiceCommand } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Tasks
  getTasks(): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<boolean>;
  
  // Activities
  getActivities(limit?: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  
  // Voice Commands
  createVoiceCommand(command: InsertVoiceCommand): Promise<VoiceCommand>;
  getUnprocessedVoiceCommands(): Promise<VoiceCommand[]>;
  markVoiceCommandProcessed(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getTasks(): Promise<Task[]> {
    const result = await db.select().from(tasks).orderBy(desc(tasks.aiScore), desc(tasks.createdAt));
    return result;
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || undefined;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values(insertTask)
      .returning();
    return task;
  }

  async updateTask(id: number, updates: Partial<InsertTask>): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task || undefined;
  }

  async deleteTask(id: number): Promise<boolean> {
    const result = await db.delete(tasks).where(eq(tasks.id, id));
    return result.rowCount > 0;
  }

  async getActivities(limit = 10): Promise<Activity[]> {
    const result = await db
      .select()
      .from(activities)
      .orderBy(desc(activities.createdAt))
      .limit(limit);
    return result;
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const [activity] = await db
      .insert(activities)
      .values(insertActivity)
      .returning();
    return activity;
  }

  async createVoiceCommand(insertCommand: InsertVoiceCommand): Promise<VoiceCommand> {
    const [command] = await db
      .insert(voiceCommands)
      .values(insertCommand)
      .returning();
    return command;
  }

  async getUnprocessedVoiceCommands(): Promise<VoiceCommand[]> {
    const result = await db
      .select()
      .from(voiceCommands)
      .where(eq(voiceCommands.processed, false));
    return result;
  }

  async markVoiceCommandProcessed(id: number): Promise<void> {
    await db
      .update(voiceCommands)
      .set({ processed: true })
      .where(eq(voiceCommands.id, id));
  }
}

export const storage = new DatabaseStorage();
