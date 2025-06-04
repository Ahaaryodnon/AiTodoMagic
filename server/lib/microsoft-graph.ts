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
    const { microsoftConfig, tasks } = await import("@shared/schema");
    const { isNotNull } = await import("drizzle-orm");
    const { storage } = await import("../storage");
    
    const [config] = await db.select().from(microsoftConfig).limit(1);
    
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
    
    // Fetch all tasks with pagination (no filter to get maximum results)
    let allTasks: any[] = [];
    let nextLink = `https://graph.microsoft.com/v1.0/me/todo/lists/${defaultList.id}/tasks?$top=100`;
    
    while (nextLink) {
      const tasksResponse = await fetch(nextLink, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!tasksResponse.ok) {
        throw new Error(`Tasks API error: ${tasksResponse.status} ${tasksResponse.statusText}`);
      }
      
      const tasksData = await tasksResponse.json();
      const taskBatch = tasksData.value || [];
      allTasks.push(...taskBatch);
      
      // Check for next page
      nextLink = tasksData['@odata.nextLink'] || null;
    }
    
    // Filter for uncompleted tasks locally
    const microsoftTasks = allTasks.filter(task => task.status !== 'completed');
    
    console.log(`Successfully fetched ${microsoftTasks.length} uncompleted tasks from Microsoft To Do`);
    
    // Clear existing Microsoft tasks from local database before importing
    await db.delete(tasks).where(isNotNull(tasks.microsoftId));
    console.log("Cleared existing Microsoft tasks from local database");
    
    // Import uncompleted tasks into local database
    let importedCount = 0;
    
    for (const msTask of microsoftTasks) {
      try {
        // Convert Microsoft task to our task format
        const priority = msTask.importance === 'high' ? 'high' : 
                        msTask.importance === 'low' ? 'low' : 'normal';
        
        // All tasks from this sync are uncompleted since we filtered for them
        const completed = false;
        
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
