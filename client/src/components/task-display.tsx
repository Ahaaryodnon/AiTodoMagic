import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  List, 
  Brain, 
  Edit, 
  Trash2, 
  Undo, 
  Plus, 
  RefreshCw,
  Flame,
  Clock,
  Lightbulb
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "@shared/schema";

export function TaskDisplay() {
  const [viewMode, setViewMode] = useState<"priority" | "date" | "list">("priority");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: insights } = useQuery<{urgent: number, dueSoon: number, suggested: number}>({
    queryKey: ["/api/priority-insights"],
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Task> }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/priority-insights"] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/tasks/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/priority-insights"] });
      toast({
        title: "Task Deleted",
        description: "Task has been successfully deleted.",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/sync-microsoft-todo", {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Sync Complete",
        description: data.error || `Synced ${data.syncedCount} tasks`,
        variant: data.error ? "destructive" : "default",
      });
    },
  });

  const toggleComplete = (task: Task) => {
    updateTaskMutation.mutate({
      id: task.id,
      updates: { completed: !task.completed }
    });
  };

  const deleteTask = (id: number) => {
    deleteTaskMutation.mutate(id);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "medium": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "normal": return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
      case "low": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  const getTaskBorderColor = (priority: string) => {
    switch (priority) {
      case "high": return "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900 dark:bg-opacity-20";
      case "medium": return "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900 dark:bg-opacity-20";
      case "normal": return "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800";
      case "low": return "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900 dark:bg-opacity-20";
      default: return "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800";
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days === -1) return "Yesterday";
    if (days > 1 && days <= 7) return `In ${days} days`;
    if (days < -1 && days >= -7) return `${Math.abs(days)} days ago`;
    
    return d.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Priority Insights */}
      <Card className="bg-gradient-to-r from-blue-500 to-blue-400 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Brain className="w-8 h-8" />
              <div>
                <h2 className="text-xl font-bold">AI Priority Insights</h2>
                <p className="text-blue-100 text-sm">Smart task prioritization based on your patterns</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white hover:bg-opacity-20"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/priority-insights"] })}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white bg-opacity-20 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Flame className="w-5 h-5 text-red-300" />
                <span className="font-semibold">Urgent</span>
              </div>
              <p className="text-sm text-blue-100">
                {insights?.urgent || 0} tasks need immediate attention
              </p>
            </div>
            <div className="bg-white bg-opacity-20 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="w-5 h-5 text-yellow-300" />
                <span className="font-semibold">Due Soon</span>
              </div>
              <p className="text-sm text-blue-100">
                {insights?.dueSoon || 0} tasks due this week
              </p>
            </div>
            <div className="bg-white bg-opacity-20 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Lightbulb className="w-5 h-5 text-green-300" />
                <span className="font-semibold">Suggested</span>
              </div>
              <p className="text-sm text-blue-100">
                {insights?.suggested || 0} tasks to focus on today
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Lists */}
      <Card>
        {/* Task List Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your Tasks</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Synced with Microsoft To Do
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {/* View Options */}
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <Button
                  variant={viewMode === "priority" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("priority")}
                >
                  Priority
                </Button>
                <Button
                  variant={viewMode === "date" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("date")}
                >
                  Date
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                >
                  List
                </Button>
              </div>
              
              {/* Sync Status */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Task Items */}
        <CardContent className="p-6">
          {tasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">No tasks found.</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Use voice commands to add your first task!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-start space-x-4 p-4 border rounded-lg ${getTaskBorderColor(task.priority)} ${
                    task.completed ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="flex-shrink-0">
                      <Checkbox
                        checked={task.completed}
                        onCheckedChange={() => toggleComplete(task)}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className={`font-medium text-gray-900 dark:text-white ${
                          task.completed ? 'line-through' : ''
                        }`}>
                          {task.title}
                        </h3>
                        <Badge className={getPriorityColor(task.priority)}>
                          {task.completed ? 'Completed' : task.priority}
                        </Badge>
                      </div>
                      {task.description && (
                        <p className={`text-sm text-gray-600 dark:text-gray-400 ${
                          task.completed ? 'line-through' : ''
                        }`}>
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {task.dueDate && (
                          <span>
                            <Calendar className="w-3 h-3 inline mr-1" />
                            {formatDate(task.dueDate)}
                          </span>
                        )}
                        <span>
                          <List className="w-3 h-3 inline mr-1" />
                          {task.listName}
                        </span>
                        {task.aiScore && task.aiScore > 0 && (
                          <span>
                            <Brain className="w-3 h-3 inline mr-1" />
                            AI Score: {task.aiScore}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {task.completed ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleComplete(task)}
                      >
                        <Undo className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          toast({
                            title: "Edit Task",
                            description: "Task editing will be implemented in a future version.",
                          });
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTask(task.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              
              {/* Show More Tasks placeholder */}
              <Button
                variant="outline"
                className="w-full py-3 border-dashed"
                onClick={() => {
                  toast({
                    title: "Load More",
                    description: "Pagination will be implemented in a future version.",
                  });
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Load more tasks
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
