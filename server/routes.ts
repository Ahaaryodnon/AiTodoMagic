import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema, insertActivitySchema, insertVoiceCommandSchema, microsoftConfig } from "@shared/schema";
import { processVoiceCommand } from "./lib/openai";
import { syncWithMicrosoftTodo } from "./lib/microsoft-graph";
import { db } from "./db";
import { eq } from "drizzle-orm";

// Fuzzy string matching helper function
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Exact match
  if (s1 === s2) return 1.0;
  
  // Contains match
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Word-based similarity
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  
  let matchingWords = 0;
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1.includes(word2) || word2.includes(word1) || levenshteinDistance(word1, word2) <= 2) {
        matchingWords++;
        break;
      }
    }
  }
  
  const wordSimilarity = matchingWords / Math.max(words1.length, words2.length);
  
  // Character-based Levenshtein distance
  const distance = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  const charSimilarity = 1 - (distance / maxLen);
  
  // Return weighted average
  return (wordSimilarity * 0.7) + (charSimilarity * 0.3);
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Helper functions for Microsoft configuration
async function getMicrosoftConfig() {
  const [config] = await db.select().from(microsoftConfig).limit(1);
  return config || {
    clientId: process.env.MICROSOFT_CLIENT_ID || "",
    tenantId: process.env.MICROSOFT_TENANT_ID || "",
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
    accessToken: process.env.MICROSOFT_ACCESS_TOKEN || "",
    refreshToken: null,
    tokenExpiresAt: null,
  };
}

async function saveMicrosoftConfig(configData: any) {
  const existingConfig = await db.select().from(microsoftConfig).limit(1);
  
  if (existingConfig.length > 0) {
    const [updated] = await db
      .update(microsoftConfig)
      .set({ ...configData, updatedAt: new Date() })
      .where(eq(microsoftConfig.id, existingConfig[0].id))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(microsoftConfig)
      .values(configData)
      .returning();
    return created;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Tasks routes
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(validatedData);
      
      // Log activity
      await storage.createActivity({
        type: "task_created",
        description: `Created task: "${task.title}"`,
        metadata: { taskId: task.id }
      });

      res.json(task);
    } catch (error) {
      res.status(400).json({ message: "Invalid task data" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const oldTask = await storage.getTask(id);
      const task = await storage.updateTask(id, updates);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // If this is a Microsoft task and completion status changed, sync back to Microsoft
      if (task.microsoftId && oldTask && 'completed' in updates && oldTask.completed !== updates.completed) {
        const { updateMicrosoftTaskStatus } = await import("./lib/microsoft-graph");
        const syncSuccess = await updateMicrosoftTaskStatus(task.microsoftId, updates.completed);
        
        if (syncSuccess) {
          await storage.createActivity({
            type: "sync",
            description: `Synced task status to Microsoft To Do: "${task.title}" ${updates.completed ? 'completed' : 'reopened'}`,
            metadata: { taskId: task.id, microsoftId: task.microsoftId }
          });
        }
      }

      // Log activity
      await storage.createActivity({
        type: "task_updated",
        description: `Updated task: "${task.title}"`,
        metadata: { taskId: task.id, updates }
      });

      res.json(task);
    } catch (error) {
      res.status(400).json({ message: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.getTask(id);
      const deleted = await storage.deleteTask(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Log activity
      if (task) {
        await storage.createActivity({
          type: "task_deleted",
          description: `Deleted task: "${task.title}"`,
          metadata: { taskId: id }
        });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Voice command processing
  app.post("/api/voice-command", async (req, res) => {
    try {
      const { transcription } = req.body;
      
      if (!transcription) {
        return res.status(400).json({ message: "Transcription is required" });
      }

      // Store voice command
      const voiceCommand = await storage.createVoiceCommand({
        transcription,
        processed: false
      });

      // Process with AI
      const aiResponse = await processVoiceCommand(transcription);
      
      // Update voice command with AI response
      await storage.markVoiceCommandProcessed(voiceCommand.id);

      // Execute the command based on AI interpretation
      let result = null;
      if (aiResponse.intent === "add_task" && aiResponse.taskData) {
        const task = await storage.createTask({
          title: aiResponse.taskData.title ?? "Untitled Task",
          description: aiResponse.taskData.description,
          priority: aiResponse.taskData.priority || "normal",
          dueDate: aiResponse.taskData.dueDate ? new Date(aiResponse.taskData.dueDate) : undefined,
          aiScore: aiResponse.confidence * 100
        });
        result = task;

        await storage.createActivity({
          type: "voice_command",
          description: `Voice command processed: Added "${task.title}"`,
          metadata: { voiceCommandId: voiceCommand.id, taskId: task.id }
        });
      } else if ((aiResponse.intent === "update_task" || aiResponse.intent === "complete_task") && aiResponse.taskData) {
        // Find task by title similarity using fuzzy matching
        const tasks = await storage.getTasks();
        const searchTitle = aiResponse.taskData?.title || "";
        
        let bestMatch = null;
        let bestSimilarity = 0;
        
        for (const task of tasks) {
          const similarity = calculateSimilarity(task.title, searchTitle);
          if (similarity > bestSimilarity && similarity > 0.5) { // Minimum 50% similarity
            bestMatch = task;
            bestSimilarity = similarity;
          }
        }

        if (bestMatch) {
          // For complete_task intent, set completed to true
          const updateData = {
            title: aiResponse.taskData.title || bestMatch.title,
            description: aiResponse.taskData.description || bestMatch.description,
            priority: aiResponse.taskData.priority || bestMatch.priority,
            completed: aiResponse.intent === "complete_task" ? true : (aiResponse.taskData.completed ?? bestMatch.completed)
          };

          const oldTask = bestMatch;
          const updatedTask = await storage.updateTask(bestMatch.id, updateData);
          result = updatedTask;

          // If this is a Microsoft task and completion status changed, sync back to Microsoft
          if (updatedTask && bestMatch.microsoftId && oldTask.completed !== updateData.completed) {
            const { updateMicrosoftTaskStatus } = await import("./lib/microsoft-graph");
            const syncSuccess = await updateMicrosoftTaskStatus(bestMatch.microsoftId, Boolean(updateData.completed));
            
            if (syncSuccess) {
              await storage.createActivity({
                type: "sync",
                description: `Synced task status to Microsoft To Do: "${bestMatch.title}" ${updateData.completed ? 'completed' : 'reopened'}`,
                metadata: { taskId: bestMatch.id, microsoftId: bestMatch.microsoftId }
              });
            }
          }

          await storage.createActivity({
            type: "voice_command",
            description: `Voice command processed: ${aiResponse.intent === "complete_task" ? "Completed" : "Updated"} "${bestMatch.title}" (${Math.round(bestSimilarity * 100)}% match)`,
            metadata: { voiceCommandId: voiceCommand.id, taskId: bestMatch.id, similarity: bestSimilarity }
          });
        }
      }

      res.json({
        success: true,
        intent: aiResponse.intent,
        confidence: aiResponse.confidence,
        response: aiResponse.response,
        result
      });
    } catch (error) {
      console.error("Voice command processing error:", error);
      res.status(500).json({ message: "Failed to process voice command" });
    }
  });

  // Activities route
  app.get("/api/activities", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const activities = await storage.getActivities(limit);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // Microsoft To Do sync
  app.post("/api/sync-microsoft-todo", async (req, res) => {
    try {
      const result = await syncWithMicrosoftTodo();
      
      await storage.createActivity({
        type: "sync",
        description: `Synced with Microsoft To Do: ${result.syncedCount} tasks`,
        metadata: result
      });

      res.json(result);
    } catch (error) {
      console.error("Microsoft To Do sync error:", error);
      res.status(500).json({ message: "Failed to sync with Microsoft To Do" });
    }
  });

  // Priority insights
  app.get("/api/priority-insights", async (req, res) => {
    try {
      const tasks = await storage.getTasks();
      const now = new Date();
      const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const urgent = tasks.filter(t => !t.completed && t.priority === "high").length;
      const dueSoon = tasks.filter(t => 
        !t.completed && t.dueDate && t.dueDate <= oneWeekFromNow
      ).length;
      const suggested = tasks.filter(t => 
        !t.completed && (t.aiScore || 0) > 70
      ).length;

      res.json({
        urgent,
        dueSoon,
        suggested
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate priority insights" });
    }
  });

  // Microsoft Graph configuration
  app.get("/api/microsoft-config", async (req, res) => {
    try {
      const config = await getMicrosoftConfig();
      
      res.json({
        clientId: config.clientId ? "configured" : "",
        tenantId: config.tenantId ? "configured" : "",
        clientSecret: config.clientSecret ? "configured" : "",
        isConfigured: !!(config.clientId && config.tenantId && config.clientSecret),
        isAuthenticated: !!config.accessToken,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get Microsoft configuration" });
    }
  });

  app.post("/api/microsoft-config", async (req, res) => {
    try {
      const { clientId, tenantId, clientSecret } = req.body;
      
      if (!clientId || !tenantId || !clientSecret) {
        return res.status(400).json({ message: "All fields are required" });
      }

      await saveMicrosoftConfig({
        clientId,
        tenantId,
        clientSecret,
      });

      res.json({ success: true, message: "Configuration saved successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to save Microsoft configuration" });
    }
  });

  app.post("/api/microsoft-auth", async (req, res) => {
    try {
      const config = await getMicrosoftConfig();
      
      if (!config.clientId || !config.tenantId) {
        return res.status(400).json({ message: "Microsoft configuration is incomplete" });
      }

      // Generate OAuth URL - Force HTTPS for Replit apps
      const host = req.get('host');
      const redirectUri = `https://${host}/auth/callback`;
      const authUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?` +
        `client_id=${config.clientId}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=https://graph.microsoft.com/Tasks.ReadWrite%20https://graph.microsoft.com/User.Read&` +
        `response_mode=query&` +
        `prompt=select_account`;

      res.json({ 
        authUrl,
        redirectUri,
        isMobile: /Mobile|Android|iPhone|iPad/.test(req.get('User-Agent') || ''),
        message: "Please complete authentication" 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to start authentication" });
    }
  });

  // OAuth callback endpoint
  app.get("/auth/callback", async (req, res) => {
    try {
      const { code, error, error_description } = req.query;

      if (error) {
        return res.send(`
          <html>
            <body>
              <h2>Authentication Error</h2>
              <p>Error: ${error}</p>
              <p>Description: ${error_description}</p>
              <button onclick="window.close()">Close Window</button>
            </body>
          </html>
        `);
      }

      if (!code) {
        return res.send(`
          <html>
            <body>
              <h2>Authentication Error</h2>
              <p>No authorization code received</p>
              <button onclick="window.close()">Close Window</button>
            </body>
          </html>
        `);
      }

      const config = await getMicrosoftConfig();
      
      // Exchange code for access token
      const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
      const redirectUri = `https://${req.get('host')}/auth/callback`;
      
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId!,
          client_secret: config.clientSecret!,
          code: code as string,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: 'https://graph.microsoft.com/Tasks.ReadWrite https://graph.microsoft.com/User.Read',
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        return res.send(`
          <html>
            <body>
              <h2>Token Exchange Error</h2>
              <p>Error: ${tokenData.error}</p>
              <p>Description: ${tokenData.error_description}</p>
              <button onclick="window.close()">Close Window</button>
            </body>
          </html>
        `);
      }

      // Store the access token in database
      await saveMicrosoftConfig({
        ...config,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
      });

      res.send(`
        <html>
          <body>
            <h2>Authentication Successful!</h2>
            <p>You have successfully connected to Microsoft Graph.</p>
            <p>You can now close this window and return to the application.</p>
            <script>
              setTimeout(() => {
                window.close();
              }, 3000);
            </script>
            <button onclick="window.close()">Close Window</button>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.send(`
        <html>
          <body>
            <h2>Authentication Error</h2>
            <p>An unexpected error occurred during authentication.</p>
            <button onclick="window.close()">Close Window</button>
          </body>
        </html>
      `);
    }
  });

  app.post("/api/microsoft-test", async (req, res) => {
    try {
      const config = await getMicrosoftConfig();
      
      if (!config.accessToken) {
        return res.json({ 
          success: false, 
          error: "No access token available. Please authenticate first." 
        });
      }

      // Test the connection by making a real Graph API call
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Clear invalid token
          await saveMicrosoftConfig({
            ...config,
            accessToken: "",
            refreshToken: null,
            tokenExpiresAt: null,
          });
          return res.json({ 
            success: false, 
            error: "Authentication expired. Please re-authenticate." 
          });
        }
        throw new Error(`Graph API error: ${response.status}`);
      }

      const userData = await response.json();
      res.json({ 
        success: true, 
        message: `Successfully connected as ${userData.displayName || userData.userPrincipalName}` 
      });
    } catch (error) {
      res.json({ 
        success: false, 
        error: "Connection test failed: " + (error instanceof Error ? error.message : "Unknown error")
      });
    }
  });

  app.post("/api/microsoft-logout", async (req, res) => {
    try {
      const config = await getMicrosoftConfig();
      await saveMicrosoftConfig({
        ...config,
        accessToken: "",
        refreshToken: null,
        tokenExpiresAt: null,
      });
      res.json({ success: true, message: "Successfully logged out from Microsoft Graph" });
    } catch (error) {
      res.status(500).json({ message: "Failed to logout" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
