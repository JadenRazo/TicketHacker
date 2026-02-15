import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { useUIStore } from '../store/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTenant, updateTenant, getOpenClawStatus } from '../lib/api';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { darkMode, toggleDarkMode, toggleSidebar } = useUIStore();
  const queryClient = useQueryClient();

  const { data: tenant, isLoading, error } = useQuery({
    queryKey: ['tenant'],
    queryFn: getTenant,
  });

  const [brandingColors, setBrandingColors] = useState({
    primary: '',
    secondary: '',
    accent: '',
  });

  const { data: openclawStatus } = useQuery({
    queryKey: ['openclaw-status'],
    queryFn: getOpenClawStatus,
    retry: false,
  });

  const updateTenantMutation = useMutation({
    mutationFn: (data: { settings: Record<string, any> }) => updateTenant(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      queryClient.invalidateQueries({ queryKey: ['openclaw-status'] });
    },
  });

  const handleBrandingUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateTenantMutation.mutate({
      settings: {
        branding: brandingColors,
      },
    });
  };

  const currentBranding = tenant?.settings?.branding || {};

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Loading settings...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">
            Failed to load settings: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Settings
      </h1>

      <div className="space-y-6">
        {/* Profile Section */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Profile
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name
              </label>
              <div className="text-gray-900 dark:text-gray-100">
                {user?.name || '-'}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <div className="text-gray-900 dark:text-gray-100">
                {user?.email}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Role
              </label>
              <div className="text-gray-900 dark:text-gray-100 capitalize">
                {user?.role}
              </div>
            </div>
          </div>
        </div>

        {/* Tenant Section */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Tenant Information
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tenant Name
              </label>
              <div className="text-gray-900 dark:text-gray-100">
                {tenant?.name}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Plan
              </label>
              <div className="text-gray-900 dark:text-gray-100 capitalize">
                {tenant?.plan}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Slug
              </label>
              <div className="text-gray-900 dark:text-gray-100">
                {tenant?.slug}
              </div>
            </div>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Preferences
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Dark Mode
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Use dark theme across the application
                </p>
              </div>
              <button
                onClick={toggleDarkMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  darkMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    darkMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Sidebar
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Show or hide the sidebar navigation
                </p>
              </div>
              <button
                onClick={toggleSidebar}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Toggle
              </button>
            </div>
          </div>
        </div>

        {/* AI Agent Section */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            AI Agent (OpenClaw)
          </h2>

          <div className="mb-4 flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                openclawStatus?.connected
                  ? 'bg-green-500'
                  : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {openclawStatus?.connected ? 'Connected' : 'Disconnected'}
              {openclawStatus?.error && ` - ${openclawStatus.error}`}
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Enable AI Agent
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Turn on AI-powered ticket handling
                </p>
              </div>
              <button
                onClick={() =>
                  updateTenantMutation.mutate({
                    settings: {
                      ...tenant?.settings,
                      openclawEnabled: !tenant?.settings?.openclawEnabled,
                    },
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  tenant?.settings?.openclawEnabled
                    ? 'bg-blue-600'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    tenant?.settings?.openclawEnabled
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Agent Mode
              </label>
              <select
                value={tenant?.settings?.openclawAgentMode || 'copilot'}
                onChange={(e) =>
                  updateTenantMutation.mutate({
                    settings: {
                      ...tenant?.settings,
                      openclawAgentMode: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value="copilot">Copilot (drafts for review)</option>
                <option value="autonomous">Autonomous (acts independently)</option>
                <option value="off">Off</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Copilot mode drafts replies for agent review. Autonomous mode sends replies directly.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Widget AI Agent
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  AI responds to widget chat messages
                </p>
              </div>
              <button
                onClick={() =>
                  updateTenantMutation.mutate({
                    settings: {
                      ...tenant?.settings,
                      openclawWidgetAgent: !tenant?.settings?.openclawWidgetAgent,
                    },
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  tenant?.settings?.openclawWidgetAgent
                    ? 'bg-blue-600'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    tenant?.settings?.openclawWidgetAgent
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Auto-Triage
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Automatically triage new tickets with AI
                </p>
              </div>
              <button
                onClick={() =>
                  updateTenantMutation.mutate({
                    settings: {
                      ...tenant?.settings,
                      openclawAutoTriage: !tenant?.settings?.openclawAutoTriage,
                    },
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  tenant?.settings?.openclawAutoTriage
                    ? 'bg-blue-600'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    tenant?.settings?.openclawAutoTriage
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confidence Threshold: {((tenant?.settings?.openclawConfidenceThreshold || 0.8) * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                value={tenant?.settings?.openclawConfidenceThreshold || 0.8}
                onChange={(e) =>
                  updateTenantMutation.mutate({
                    settings: {
                      ...tenant?.settings,
                      openclawConfidenceThreshold: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Minimum confidence required for the AI to take autonomous action
              </p>
            </div>
          </div>
        </div>

        {/* Branding Section */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Branding
          </h2>

          {currentBranding && Object.keys(currentBranding).length > 0 && (
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-md">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Current Colors
              </p>
              <div className="flex gap-4">
                {currentBranding.primary && (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: currentBranding.primary }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Primary: {currentBranding.primary}
                    </span>
                  </div>
                )}
                {currentBranding.secondary && (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: currentBranding.secondary }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Secondary: {currentBranding.secondary}
                    </span>
                  </div>
                )}
                {currentBranding.accent && (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: currentBranding.accent }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Accent: {currentBranding.accent}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleBrandingUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Primary Color
              </label>
              <input
                type="color"
                value={brandingColors.primary || currentBranding.primary || '#3b82f6'}
                onChange={(e) => setBrandingColors({ ...brandingColors, primary: e.target.value })}
                className="h-10 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Secondary Color
              </label>
              <input
                type="color"
                value={brandingColors.secondary || currentBranding.secondary || '#6b7280'}
                onChange={(e) => setBrandingColors({ ...brandingColors, secondary: e.target.value })}
                className="h-10 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Accent Color
              </label>
              <input
                type="color"
                value={brandingColors.accent || currentBranding.accent || '#8b5cf6'}
                onChange={(e) => setBrandingColors({ ...brandingColors, accent: e.target.value })}
                className="h-10 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </div>
            <button
              type="submit"
              disabled={updateTenantMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
            >
              {updateTenantMutation.isPending ? 'Updating...' : 'Update Branding'}
            </button>
            {updateTenantMutation.isSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">
                Branding updated successfully
              </p>
            )}
            {updateTenantMutation.isError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Failed to update branding
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
