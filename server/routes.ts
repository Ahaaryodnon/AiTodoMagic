import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema, insertActivitySchema, insertVoiceCommandSchema } from "@shared/schema";
import { processVoiceCommand } from "./lib/openai";
import { syncWithMicrosoftTodo } from "./lib/microsoft-graph";

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
      const task = await storage.updateTask(id, updates);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
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
      } else if (aiResponse.intent === "update_task" && aiResponse.taskData) {
        // Find task by title similarity and update
        const tasks = await storage.getTasks();
        const targetTask = tasks.find(t => 
          t.title.toLowerCase().includes(aiResponse.taskData?.title?.toLowerCase() || "")
        );

        if (targetTask) {
          const updatedTask = await storage.updateTask(targetTask.id, {
            title: aiResponse.taskData.title || targetTask.title,
            description: aiResponse.taskData.description || targetTask.description,
            priority: aiResponse.taskData.priority || targetTask.priority,
            completed: aiResponse.taskData.completed ?? targetTask.completed
          });
          result = updatedTask;

          await storage.createActivity({
            type: "voice_command",
            description: `Voice command processed: Updated "${targetTask.title}"`,
            metadata: { voiceCommandId: voiceCommand.id, taskId: targetTask.id }
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
  let microsoftConfig = {
    clientId: process.env.MICROSOFT_CLIENT_ID || "",
    tenantId: process.env.MICROSOFT_TENANT_ID || "",
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
    accessToken: process.env.MICROSOFT_ACCESS_TOKEN || "",
  };

  app.get("/api/microsoft-config", async (req, res) => {
    try {
      res.json({
        clientId: microsoftConfig.clientId ? "configured" : "",
        tenantId: microsoftConfig.tenantId ? "configured" : "",
        clientSecret: microsoftConfig.clientSecret ? "configured" : "",
        isConfigured: !!(microsoftConfig.clientId && microsoftConfig.tenantId && microsoftConfig.clientSecret),
        isAuthenticated: !!microsoftConfig.accessToken,
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

      microsoftConfig = {
        ...microsoftConfig,
        clientId,
        tenantId,
        clientSecret,
      };

      res.json({ success: true, message: "Configuration saved successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to save Microsoft configuration" });
    }
  });

  app.post("/api/microsoft-auth", async (req, res) => {
    try {
      if (!microsoftConfig.clientId || !microsoftConfig.tenantId) {
        return res.status(400).json({ message: "Microsoft configuration is incomplete" });
      }

      // Generate OAuth URL
      const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
      const authUrl = `https://login.microsoftonline.com/${microsoftConfig.tenantId}/oauth2/v2.0/authorize?` +
        `client_id=${microsoftConfig.clientId}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=https://graph.microsoft.com/Tasks.ReadWrite%20https://graph.microsoft.com/User.Read&` +
        `response_mode=query`;

      res.json({ 
        authUrl,
        message: "Please complete authentication in the browser window" 
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

      // Exchange code for access token
      const tokenUrl = `https://login.microsoftonline.com/${microsoftConfig.tenantId}/oauth2/v2.0/token`;
      const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
      
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: microsoftConfig.clientId,
          client_secret: microsoftConfig.clientSecret,
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

      // Store the access token
      microsoftConfig.accessToken = tokenData.access_token;

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
      if (!microsoftConfig.accessToken) {
        return res.json({ 
          success: false, 
          error: "No access token available. Please authenticate first." 
        });
      }

      // Test the connection by making a real Graph API call
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${microsoftConfig.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Clear invalid token
          microsoftConfig.accessToken = "";
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
      microsoftConfig.accessToken = "";
      res.json({ success: true, message: "Successfully logged out from Microsoft Graph" });
    } catch (error) {
      res.status(500).json({ message: "Failed to logout" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
