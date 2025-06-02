import { VoiceInput } from "@/components/voice-input";
import { TaskDisplay } from "@/components/task-display";
import { ActivityFeed } from "@/components/activity-feed";
import { SettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { Mic, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Plus, CheckCircle2, Clock, AlertTriangle, Mic, Settings, Activity } from "lucide-react";
import { toast, useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/queryClient";

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high",
    dueDate: "",
  });
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showActivityFeed, setShowActivityFeed] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Handle authentication success/error from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authResult = urlParams.get('auth');
    const error = urlParams.get('error');

    if (authResult === 'success') {
      toast({
        title: "Authentication Successful",
        description: "Successfully connected to Microsoft Graph!",
      });
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
      // Refresh config to show updated status
      queryClient.invalidateQueries({ queryKey: ["/api/microsoft-config"] });
    } else if (error) {
      toast({
        title: "Authentication Error",
        description: `Authentication failed: ${error}`,
        variant: "destructive",
      });
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast, queryClient]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">VoiceTask</h1>
                <p className="text-xs text-gray-600 dark:text-gray-400">AI-Powered Microsoft To Do</p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Connected to Microsoft To Do</span>
              </div>

              <SettingsDialog />

              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                {theme === "dark" ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Voice Input Section */}
          <div className="lg:col-span-1">
            <VoiceInput />
          </div>

          {/* Tasks Display Section */}
          <div className="lg:col-span-2">
            <TaskDisplay />
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="mt-8">
          <ActivityFeed />
        </div>
      </main>
    </div>
  );
}