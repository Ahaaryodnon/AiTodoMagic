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
    // Get the access token from the database instead of environment variables
    const { db } = await import("../db");
    const { microsoftConfig } = await import("@shared/schema");
    
    const [config] = await db.select().from(microsoftConfig).limit(1);
    
    console.log("Microsoft config found:", config ? "Yes" : "No");
    console.log("Access token available:", config?.accessToken ? "Yes" : "No");
    
    if (!config || !config.accessToken) {
      return {
        syncedCount: 0,
        error: "Microsoft access token not configured. Please authenticate in Settings."
      };
    }
    
    // First, get the default task list
    const listsResponse = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!listsResponse.ok) {
      if (listsResponse.status === 401) {
        return {
          syncedCount: 0,
          error: "Authentication expired. Please re-authenticate in Settings."
        };
      }
      throw new Error(`Graph API error: ${listsResponse.status} ${listsResponse.statusText}`);
    }
    
    const listsData = await listsResponse.json();
    const taskLists = listsData.value || [];
    
    if (taskLists.length === 0) {
      return {
        syncedCount: 0,
        error: "No task lists found in Microsoft To Do"
      };
    }
    
    // Use the first list (usually the default "Tasks" list)
    const defaultList = taskLists[0];
    
    // Fetch tasks from the default list
    const tasksResponse = await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${defaultList.id}/tasks`, {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!tasksResponse.ok) {
      throw new Error(`Tasks API error: ${tasksResponse.status} ${tasksResponse.statusText}`);
    }
    
    const tasksData = await tasksResponse.json();
    const microsoftTasks = tasksData.value || [];
    
    console.log(`Successfully fetched ${microsoftTasks.length} tasks from Microsoft To Do`);
    
    // Import tasks into local database
    const { storage } = await import("../storage");
    let importedCount = 0;
    
    for (const msTask of microsoftTasks) {
      try {
        // Check if task already exists by Microsoft ID
        const existingTasks = await storage.getTasks();
        const existingTask = existingTasks.find(task => task.microsoftId === msTask.id);
        
        if (!existingTask) {
          // Convert Microsoft task to our task format
          const priority = msTask.importance === 'high' ? 'high' : 
                          msTask.importance === 'low' ? 'low' : 'normal';
          
          const completed = msTask.status === 'completed';
          
          let dueDate = null;
          if (msTask.dueDateTime && msTask.dueDateTime.dateTime) {
            dueDate = new Date(msTask.dueDateTime.dateTime);
          }
          
          const description = msTask.body?.content || '';
          
          await storage.createTask({
            title: msTask.title,
            description: description,
            priority: priority as 'low' | 'normal' | 'medium' | 'high',
            completed: completed,
            dueDate: dueDate,
            microsoftId: msTask.id
          });
          
          importedCount++;
        }
      } catch (taskError) {
        console.error(`Failed to import task ${msTask.id}:`, taskError);
      }
    }
    
    return {
      syncedCount: importedCount,
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
    // Get the access token from the database
    const { db } = await import("../db");
    const { microsoftConfig } = await import("@shared/schema");
    
    const [config] = await db.select().from(microsoftConfig).limit(1);
    
    if (!config || !config.accessToken) {
      console.warn("Microsoft access token not available for task creation");
      return null;
    }
    
    // Get the default task list first
    const listsResponse = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!listsResponse.ok) {
      console.error(`Failed to get task lists: ${listsResponse.status}`);
      return null;
    }
    
    const listsData = await listsResponse.json();
    const taskLists = listsData.value || [];
    
    if (taskLists.length === 0) {
      console.error("No task lists found in Microsoft To Do");
      return null;
    }
    
    const defaultList = taskLists[0];
    
    // Create the task
    const taskData = {
      title: title,
      body: description ? {
        content: description,
        contentType: "text"
      } : undefined
    };
    
    const createResponse = await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${defaultList.id}/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(taskData)
    });
    
    if (!createResponse.ok) {
      console.error(`Failed to create Microsoft task: ${createResponse.status}`);
      return null;
    }
    
    const createdTask = await createResponse.json();
    console.log("Successfully created Microsoft To Do task:", createdTask.id);
    
    return createdTask.id;
  } catch (error) {
    console.error("Microsoft task creation error:", error);
    return null;
  }
}
