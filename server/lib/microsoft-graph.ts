// Microsoft Graph API integration for To Do
interface MicrosoftTask {
  id: string;
  title: string;
  body?: {
    content: string;
  };
  importance: "low" | "normal" | "high";
  status: "notStarted" | "inProgress" | "completed";
  dueDateTime?: {
    dateTime: string;
    timeZone: string;
  };
}

interface SyncResult {
  syncedCount: number;
  error?: string;
}

export async function syncWithMicrosoftTodo(): Promise<SyncResult> {
  try {
    const accessToken = process.env.MICROSOFT_ACCESS_TOKEN;
    
    if (!accessToken) {
      return {
        syncedCount: 0,
        error: "Microsoft access token not configured. Please authenticate in Settings."
      };
    }
    
    // Make actual Graph API call to fetch tasks
    const response = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists/tasks/tasks', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        return {
          syncedCount: 0,
          error: "Authentication expired. Please re-authenticate in Settings."
        };
      }
      throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const tasks = data.value || [];
    
    console.log(`Successfully fetched ${tasks.length} tasks from Microsoft To Do`);
    
    return {
      syncedCount: tasks.length,
    };
  } catch (error) {
    console.error("Microsoft To Do sync error:", error);
    return {
      syncedCount: 0,
      error: error instanceof Error ? error.message : "Unknown sync error"
    };
  }
}

export async function createMicrosoftTask(title: string, description?: string): Promise<string | null> {
  try {
    const accessToken = process.env.MICROSOFT_ACCESS_TOKEN;
    
    if (!accessToken) {
      console.warn("Microsoft access token not available for task creation");
      return null;
    }
    
    // In production, this would make actual API calls to Microsoft Graph
    console.log("Would create Microsoft To Do task:", { title, description });
    
    return null;
  } catch (error) {
    console.error("Microsoft task creation error:", error);
    return null;
  }
}
