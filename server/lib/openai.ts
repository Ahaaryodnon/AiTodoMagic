import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
});

interface VoiceCommandResult {
  intent: "add_task" | "update_task" | "complete_task" | "set_priority" | "unknown";
  confidence: number;
  response: string;
  taskData?: {
    title?: string;
    description?: string;
    priority?: "low" | "normal" | "medium" | "high";
    dueDate?: string;
    completed?: boolean;
  };
}

export async function processVoiceCommand(transcription: string): Promise<VoiceCommandResult> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that processes voice commands for task management. 
          Analyze the user's voice command and extract the intent and task information.
          
          Possible intents:
          - add_task: User wants to create a new task
          - update_task: User wants to modify an existing task
          - complete_task: User wants to mark a task as completed
          - set_priority: User wants to change task priority
          - unknown: Command doesn't match any intent
          
          Priority levels: low, normal, medium, high
          
          Respond in JSON format with:
          {
            "intent": "intent_name",
            "confidence": 0.0-1.0,
            "response": "friendly confirmation message",
            "taskData": {
              "title": "extracted task title",
              "description": "extracted description",
              "priority": "extracted priority",
              "dueDate": "ISO date string if mentioned",
              "completed": boolean if completion status mentioned
            }
          }`
        },
        {
          role: "user",
          content: transcription
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      intent: result.intent || "unknown",
      confidence: Math.max(0, Math.min(1, result.confidence || 0)),
      response: result.response || "I couldn't understand that command.",
      taskData: result.taskData
    };
  } catch (error) {
    console.error("OpenAI processing error:", error);
    return {
      intent: "unknown",
      confidence: 0,
      response: "Sorry, I had trouble processing your command. Please try again.",
    };
  }
}

export async function generateTaskPriority(taskTitle: string, taskDescription?: string): Promise<number> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an AI task prioritization expert. Analyze the given task and provide a priority score from 0-100.
          
          Consider:
          - Urgency indicators (deadlines, time-sensitive words)
          - Importance (work vs personal, impact level)
          - Complexity (simple vs complex tasks)
          - Dependencies (blocks other work)
          
          Respond in JSON format:
          {
            "score": 0-100,
            "reasoning": "brief explanation"
          }`
        },
        {
          role: "user",
          content: `Task: ${taskTitle}${taskDescription ? `\nDescription: ${taskDescription}` : ""}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return Math.max(0, Math.min(100, result.score || 0));
  } catch (error) {
    console.error("Priority generation error:", error);
    return 50; // Default medium priority
  }
}
