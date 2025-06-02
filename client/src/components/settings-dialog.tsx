import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Save, RefreshCw, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface MicrosoftConfig {
  clientId: string;
  tenantId: string;
  clientSecret: string;
  isConfigured: boolean;
  isAuthenticated: boolean;
}

export function SettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState({
    clientId: "",
    tenantId: "",
    clientSecret: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: microsoftConfig, isLoading } = useQuery<MicrosoftConfig>({
    queryKey: ["/api/microsoft-config"],
    enabled: isOpen,
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (configData: typeof config) => {
      const response = await apiRequest("POST", "/api/microsoft-config", configData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuration Saved",
        description: "Microsoft Graph configuration has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/microsoft-config"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save Microsoft Graph configuration.",
        variant: "destructive",
      });
    },
  });

  const authenticateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/microsoft-auth", {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.authUrl) {
        // Open auth URL in current window instead of popup
        window.location.href = data.authUrl;
      }
    },
    onError: () => {
      toast({
        title: "Authentication Error",
        description: "Failed to start Microsoft authentication process.",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/microsoft-logout", {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Logged Out",
        description: "Successfully logged out of Microsoft Graph.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/microsoft-config"] });
    },
    onError: () => {
      toast({
        title: "Logout Error",
        description: "Failed to logout from Microsoft Graph.",
        variant: "destructive",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/microsoft-test", {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Connection Test",
        description: data.success ? "Successfully connected to Microsoft Graph!" : "Connection failed: " + data.error,
        variant: data.success ? "default" : "destructive",
      });
    },
  });

  const handleSaveConfig = () => {
    if (!config.clientId || !config.tenantId || !config.clientSecret) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    saveConfigMutation.mutate(config);
  };

  const handleInputChange = (field: keyof typeof config, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Microsoft To Do Integration Settings</DialogTitle>
          <DialogDescription>
            Configure your Microsoft Graph API credentials to enable real-time synchronization with Microsoft To Do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Connection Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center space-x-2">
                <span>Connection Status</span>
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : microsoftConfig?.isAuthenticated ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Microsoft Graph API Status
                  </p>
                  <Badge variant={microsoftConfig?.isAuthenticated ? "default" : "destructive"}>
                    {microsoftConfig?.isAuthenticated ? "Connected" : "Not Connected"}
                  </Badge>
                </div>
                <div className="space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnectionMutation.mutate()}
                    disabled={testConnectionMutation.isPending || !microsoftConfig?.isConfigured}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${testConnectionMutation.isPending ? 'animate-spin' : ''}`} />
                    Test Connection
                  </Button>
                  {microsoftConfig?.isConfigured && !microsoftConfig?.isAuthenticated && (
                    <Button
                      onClick={() => authenticateMutation.mutate()}
                      disabled={authenticateMutation.isPending}
                      size="sm"
                    >
                      Authenticate
                    </Button>
                  )}
                  {microsoftConfig?.isAuthenticated && (
                    <Button
                      variant="outline"
                      onClick={() => logoutMutation.mutate()}
                      disabled={logoutMutation.isPending}
                      size="sm"
                    >
                      Logout
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Microsoft Graph Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Microsoft Graph API Configuration</CardTitle>
              <CardDescription>
                Enter your Azure App Registration details. You'll need to create an app in the Azure portal first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clientId">Application (Client) ID</Label>
                <Input
                  id="clientId"
                  type="text"
                  placeholder="12345678-1234-1234-1234-123456789012"
                  value={config.clientId}
                  onChange={(e) => handleInputChange("clientId", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenantId">Directory (Tenant) ID</Label>
                <Input
                  id="tenantId"
                  type="text"
                  placeholder="87654321-4321-4321-4321-210987654321"
                  value={config.tenantId}
                  onChange={(e) => handleInputChange("tenantId", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  placeholder="Enter your client secret"
                  value={config.clientSecret}
                  onChange={(e) => handleInputChange("clientSecret", e.target.value)}
                />
              </div>

              <Button
                onClick={handleSaveConfig}
                disabled={saveConfigMutation.isPending}
                className="w-full"
              >
                <Save className={`w-4 h-4 mr-2 ${saveConfigMutation.isPending ? 'animate-spin' : ''}`} />
                Save Configuration
              </Button>
            </CardContent>
          </Card>

          {/* Setup Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm space-y-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">1. Create Azure App Registration:</p>
                  <p className="text-gray-600 dark:text-gray-400 ml-4">
                    Go to Azure Portal → App registrations → New registration
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">2. Configure API Permissions:</p>
                  <p className="text-gray-600 dark:text-gray-400 ml-4">
                    Add Microsoft Graph API permissions: Tasks.ReadWrite, User.Read
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">3. Create Client Secret:</p>
                  <p className="text-gray-600 dark:text-gray-400 ml-4">
                    In Certificates & secrets → New client secret
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">4. Set Redirect URI:</p>
                  <p className="text-gray-600 dark:text-gray-400 ml-4">
                    Add redirect URI: {window.location.origin}/auth/callback
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade", "_blank")}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Azure Portal
              </Button>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}