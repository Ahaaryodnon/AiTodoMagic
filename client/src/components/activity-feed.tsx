import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mic, Check, RefreshCw, Brain } from "lucide-react";
import type { Activity } from "@shared/schema";

export function ActivityFeed() {
  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "voice_command":
        return <Mic className="w-4 h-4 text-white" />;
      case "task_completed":
        return <Check className="w-4 h-4 text-white" />;
      case "sync":
        return <RefreshCw className="w-4 h-4 text-white" />;
      case "ai_insight":
        return <Brain className="w-4 h-4 text-white" />;
      default:
        return <Mic className="w-4 h-4 text-white" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "voice_command":
        return "bg-blue-500";
      case "task_completed":
        return "bg-green-500";
      case "sync":
        return "bg-blue-400";
      case "ai_insight":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

  const formatTimeAgo = (date: string | null) => {
    if (!date) return "Unknown time";
    
    const now = new Date();
    const activityDate = new Date(date);
    const diffMs = now.getTime() - activityDate.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    
    return activityDate.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recent Activity</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            View All
          </Button>
        </div>
        
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No recent activity.</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              Start using voice commands to see activity here!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start space-x-4">
                <div className={`flex-shrink-0 w-8 h-8 ${getActivityColor(activity.type)} rounded-full flex items-center justify-center`}>
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-900 dark:text-gray-300">
                    {activity.description}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatTimeAgo(activity.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
