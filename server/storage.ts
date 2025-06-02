import { tasks, activities, voiceCommands, type Task, type InsertTask, type Activity, type InsertActivity, type VoiceCommand, type InsertVoiceCommand } from "@shared/schema";

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

export class MemStorage implements IStorage {
  private tasks: Map<number, Task>;
  private activities: Map<number, Activity>;
  private voiceCommands: Map<number, VoiceCommand>;
  private currentTaskId: number;
  private currentActivityId: number;
  private currentVoiceCommandId: number;

  constructor() {
    this.tasks = new Map();
    this.activities = new Map();
    this.voiceCommands = new Map();
    this.currentTaskId = 1;
    this.currentActivityId = 1;
    this.currentVoiceCommandId = 1;
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values()).sort((a, b) => {
      // Sort by AI score descending, then by priority
      const priorityOrder = { high: 4, medium: 3, normal: 2, low: 1 };
      if (a.aiScore !== b.aiScore) {
        return (b.aiScore || 0) - (a.aiScore || 0);
      }
      return priorityOrder[b.priority as keyof typeof priorityOrder] - priorityOrder[a.priority as keyof typeof priorityOrder];
    });
  }

  async getTask(id: number): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = this.currentTaskId++;
    const now = new Date();
    const task: Task = { 
      ...insertTask, 
      id, 
      createdAt: now,
      updatedAt: now
    };
    this.tasks.set(id, task);
    return task;
  }

  async updateTask(id: number, updates: Partial<InsertTask>): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    
    const updatedTask: Task = { 
      ...task, 
      ...updates, 
      updatedAt: new Date()
    };
    this.tasks.set(id, updatedTask);
    return updatedTask;
  }

  async deleteTask(id: number): Promise<boolean> {
    return this.tasks.delete(id);
  }

  // Activities
  async getActivities(limit = 10): Promise<Activity[]> {
    return Array.from(this.activities.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const id = this.currentActivityId++;
    const activity: Activity = {
      ...insertActivity,
      id,
      createdAt: new Date()
    };
    this.activities.set(id, activity);
    return activity;
  }

  // Voice Commands
  async createVoiceCommand(insertCommand: InsertVoiceCommand): Promise<VoiceCommand> {
    const id = this.currentVoiceCommandId++;
    const command: VoiceCommand = {
      ...insertCommand,
      id,
      createdAt: new Date()
    };
    this.voiceCommands.set(id, command);
    return command;
  }

  async getUnprocessedVoiceCommands(): Promise<VoiceCommand[]> {
    return Array.from(this.voiceCommands.values()).filter(cmd => !cmd.processed);
  }

  async markVoiceCommandProcessed(id: number): Promise<void> {
    const command = this.voiceCommands.get(id);
    if (command) {
      this.voiceCommands.set(id, { ...command, processed: true });
    }
  }
}

export const storage = new MemStorage();
