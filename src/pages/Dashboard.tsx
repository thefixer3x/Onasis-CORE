/**
 * Dashboard Page Component
 * Main dashboard for authenticated users
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authConfig } from "@/config/auth.config";
import {
  Key,
  Code2,
  FileText,
  Settings,
  Activity,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  BookOpen,
  Shield,
} from "lucide-react";
import toast from "react-hot-toast";

interface QuickAction {
  icon: React.ElementType;
  label: string;
  description: string;
  action: () => void;
  color: string;
}

interface Stat {
  label: string;
  value: string | number;
  change: string;
  trend: "up" | "down" | "neutral";
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  created: string;
}

interface DashboardStats {
  calls?: {
    today?: number;
  };
  responseTime?: {
    avg?: number;
  };
  successRate?: number;
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem(authConfig.session.tokenKey);

      // Fetch API keys
      const keysResponse = await fetch("/api/keys", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (keysResponse.ok) {
        const keysData = await keysResponse.json();
        setApiKeys(keysData.keys || []);
      }

      // Fetch stats
      const statsResponse = await fetch("/api/stats", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const createNewApiKey = async () => {
    try {
      const token = localStorage.getItem(authConfig.session.tokenKey);
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "New API Key" }),
      });

      if (response.ok) {
        const newKey = await response.json();
        setApiKeys([...apiKeys, newKey]);
        toast.success("New API key created");
      }
    } catch (error) {
      console.error("Failed to create API key:", error);
      toast.error("Failed to create API key");
    }
  };

  const apiKey = apiKeys[0]?.key || "Loading...";

  const handleCopyApiKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const quickActions: QuickAction[] = [
    {
      icon: Key,
      label: "API Keys",
      description: "Manage your API keys",
      action: () => createNewApiKey(),
      color: "bg-blue-500",
    },
    {
      icon: Code2,
      label: "API Sandbox",
      description: "Test API endpoints",
      action: async () => {
        const token = localStorage.getItem(authConfig.session.tokenKey);
        const response = await fetch("/api/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        toast.success(`API Status: ${data.status}`);
      },
      color: "bg-purple-500",
    },
    {
      icon: FileText,
      label: "Documentation",
      description: "Browse API docs",
      action: () => window.open("/api", "_blank"),
      color: "bg-green-500",
    },
    {
      icon: Settings,
      label: "Refresh Data",
      description: "Reload dashboard data",
      action: () => fetchDashboardData(),
      color: "bg-gray-500",
    },
  ];

  const statsData: Stat[] = stats
    ? [
        {
          label: "API Calls Today",
          value: stats.calls?.today?.toLocaleString() || "0",
          change: "+12.3%",
          trend: "up",
        },
        {
          label: "Active API Keys",
          value: apiKeys.length,
          change: "No change",
          trend: "neutral",
        },
        {
          label: "Response Time",
          value: `${stats.responseTime?.avg || 0}ms`,
          change: "-5ms",
          trend: "up",
        },
        {
          label: "Success Rate",
          value: `${stats.successRate || 0}%`,
          change: "+0.1%",
          trend: "up",
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                API Dashboard
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Welcome back,{" "}
                {user?.name || user?.email?.split("@")[0] || "Developer"}!
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <ExternalLink className="h-4 w-4 inline mr-2" />
                View API Docs
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statsData.map((stat, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {stat.value}
                  </p>
                </div>
                <Activity
                  className={`h-8 w-8 ${
                    stat.trend === "up"
                      ? "text-green-500"
                      : stat.trend === "down"
                      ? "text-red-500"
                      : "text-gray-500"
                  }`}
                />
              </div>
              <p
                className={`text-sm mt-2 ${
                  stat.trend === "up"
                    ? "text-green-600"
                    : stat.trend === "down"
                    ? "text-red-600"
                    : "text-gray-600"
                }`}
              >
                {stat.change} from yesterday
              </p>
            </div>
          ))}
        </div>

        {/* API Key Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Your API Keys
              </h2>
              <button
                onClick={createNewApiKey}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                <Key className="h-4 w-4 mr-2" />
                Generate New Key
              </button>
            </div>

            {apiKeys.length > 0 ? (
              <div className="space-y-3">
                {apiKeys.map((key, index) => (
                  <div
                    key={key.id || index}
                    className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {key.name || `API Key ${index + 1}`}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Created: {new Date(key.created).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono text-gray-800 dark:text-gray-200">
                        {key.key}
                      </code>
                      <button
                        onClick={() => handleCopyApiKey(key.key)}
                        className="ml-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        {copiedKey === key.key ? (
                          <Check className="h-5 w-5 text-green-500" />
                        ) : (
                          <Copy className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <Key className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  No API keys yet. Generate your first key to get started.
                </p>
                <button
                  onClick={createNewApiKey}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Generate Your First API Key
                </button>
              </div>
            )}

            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Keep your API keys secure and never share them publicly.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={action.action}
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow text-left"
              >
                <div
                  className={`inline-flex p-3 rounded-lg ${action.color} text-white mb-4`}
                >
                  <action.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {action.label}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {action.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Code Examples */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Quick Start
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Install the SDK
                </h3>
                <div className="bg-gray-900 rounded-lg p-4">
                  <code className="text-sm text-green-400">
                    npm install @lanonasis/api-sdk
                  </code>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Initialize the client
                </h3>
                <div className="bg-gray-900 rounded-lg p-4">
                  <pre className="text-sm text-gray-300">
                    {`import { LanonasisClient } from '@lanonasis/api-sdk'

const client = new LanonasisClient({
  apiKey: '${apiKey}'
})

// Make your first API call
const response = await client.api.test()
console.log(response)`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Resources */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <a
            href="https://docs.lanonasis.com"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <BookOpen className="h-8 w-8 text-blue-500 mb-4" />
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              API Documentation
              <ExternalLink className="h-4 w-4" />
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Complete reference for all endpoints
            </p>
          </a>

          <a
            href="https://docs.lanonasis.com/quickstart"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <Terminal className="h-8 w-8 text-purple-500 mb-4" />
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              Quick Start Guide
              <ExternalLink className="h-4 w-4" />
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Get started with your first integration
            </p>
          </a>

          <a
            href="https://docs.lanonasis.com/security"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <Shield className="h-8 w-8 text-green-500 mb-4" />
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              Security Best Practices
              <ExternalLink className="h-4 w-4" />
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Keep your integration secure
            </p>
          </a>
        </div>
      </main>
    </div>
  );
};
