import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { useUIStore } from '../store/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTenant,
  updateTenant,
  getOpenClawStatus,
  updateCurrentUser,
  getWebhookEndpoints,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookDeliveries,
  retryWebhookDelivery,
  getRoutingConfig,
  updateRoutingConfig,
  getRoutingAgents,
  type WebhookEndpoint,
  type WebhookDeliveryItem,
  type RoutingConfig,
  type RoutingRule,
} from '../lib/api';

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
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

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const { data: openclawStatus } = useQuery({
    queryKey: ['openclaw-status'],
    queryFn: getOpenClawStatus,
    retry: false,
  });

  const { data: routingConfig, isLoading: routingLoading } = useQuery({
    queryKey: ['routing-config'],
    queryFn: getRoutingConfig,
    retry: false,
  });

  const { data: routingAgents } = useQuery({
    queryKey: ['routing-agents'],
    queryFn: getRoutingAgents,
    retry: false,
  });

  const [pendingRoutingRules, setPendingRoutingRules] = useState<RoutingRule[] | null>(null);

  const updateRoutingMutation = useMutation({
    mutationFn: (data: Partial<RoutingConfig>) => updateRoutingConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-config'] });
      setPendingRoutingRules(null);
    },
  });

  const activeRules = pendingRoutingRules ?? routingConfig?.routingRules ?? [];

  const addRoutingRule = () => {
    setPendingRoutingRules([...activeRules, { conditions: {} }]);
  };

  const removeRoutingRule = (index: number) => {
    const updated = activeRules.filter((_, i) => i !== index);
    setPendingRoutingRules(updated);
  };

  const updateRoutingRule = (index: number, rule: RoutingRule) => {
    const updated = activeRules.map((r, i) => (i === index ? rule : r));
    setPendingRoutingRules(updated);
  };

  const saveRoutingRules = () => {
    updateRoutingMutation.mutate({ routingRules: activeRules });
  };

  const updateTenantMutation = useMutation({
    mutationFn: (data: { settings: Record<string, any> }) => updateTenant(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      queryClient.invalidateQueries({ queryKey: ['openclaw-status'] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: { name: string }) => updateCurrentUser(data),
    onSuccess: (updatedUser) => {
      setUser({ ...user!, name: updatedUser.name });
      setEditingName(false);
    },
  });

  const handleBrandingUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateTenantMutation.mutate({
      settings: {
        ...tenant?.settings,
        branding: brandingColors,
      },
    });
  };

  const handleNameSave = () => {
    if (!nameInput.trim()) return;
    updateProfileMutation.mutate({ name: nameInput.trim() });
  };

  const updateSettings = (key: string, value: any) => {
    updateTenantMutation.mutate({
      settings: {
        ...tenant?.settings,
        [key]: value,
      },
    });
  };

  const currentBranding = tenant?.settings?.branding || {};
  const settings = tenant?.settings || {};

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
              {editingName ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false); }}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleNameSave}
                    disabled={updateProfileMutation.isPending}
                    className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
                  >
                    {updateProfileMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 dark:text-gray-100">{user?.name || '-'}</span>
                  <button
                    onClick={() => { setNameInput(user?.name || ''); setEditingName(true); }}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Edit
                  </button>
                </div>
              )}
              {updateProfileMutation.isError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  Failed to update name
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <div className="text-gray-900 dark:text-gray-100">{user?.email}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
              <div className="text-gray-900 dark:text-gray-100 capitalize">{user?.role}</div>
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tenant Name</label>
              <div className="text-gray-900 dark:text-gray-100">{tenant?.name}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan</label>
              <div className="text-gray-900 dark:text-gray-100 capitalize">{tenant?.plan}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug</label>
              <div className="text-gray-900 dark:text-gray-100">{tenant?.slug}</div>
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
                <label className="block text-sm font-medium text-gray-900 dark:text-white">Dark Mode</label>
                <p className="text-sm text-gray-500 dark:text-gray-400">Use dark theme across the application</p>
              </div>
              <button
                onClick={toggleDarkMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">Sidebar</label>
                <p className="text-sm text-gray-500 dark:text-gray-400">Show or hide the sidebar navigation</p>
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

        {/* Widget Configuration Section */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Widget Configuration
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Greeting Message</label>
              <textarea
                value={settings.widgetGreeting || ''}
                onChange={(e) => updateSettings('widgetGreeting', e.target.value)}
                placeholder="e.g. Hi there! How can we help you today?"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Shown to visitors when the chat widget opens</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Widget Position</label>
              <select
                value={settings.widgetPosition || 'right'}
                onChange={(e) => updateSettings('widgetPosition', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value="right">Bottom Right</option>
                <option value="left">Bottom Left</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Auto-open Delay (seconds)</label>
              <input
                type="number"
                min={0}
                max={300}
                value={settings.widgetAutoOpenDelay || 0}
                onChange={(e) => updateSettings('widgetAutoOpenDelay', parseInt(e.target.value, 10) || 0)}
                className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Set to 0 to disable auto-open</p>
            </div>
          </div>
        </div>

        {/* Business Hours Section */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Business Hours
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timezone</label>
              <select
                value={settings.businessHours?.timezone || 'UTC'}
                onChange={(e) => updateSettings('businessHours', { ...settings.businessHours, timezone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern Time (US)</option>
                <option value="America/Chicago">Central Time (US)</option>
                <option value="America/Denver">Mountain Time (US)</option>
                <option value="America/Los_Angeles">Pacific Time (US)</option>
                <option value="Europe/London">London</option>
                <option value="Europe/Berlin">Berlin</option>
                <option value="Europe/Paris">Paris</option>
                <option value="Asia/Tokyo">Tokyo</option>
                <option value="Asia/Shanghai">Shanghai</option>
                <option value="Australia/Sydney">Sydney</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time</label>
                <input
                  type="time"
                  value={settings.businessHours?.startTime || '09:00'}
                  onChange={(e) => updateSettings('businessHours', { ...settings.businessHours, startTime: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
                <input
                  type="time"
                  value={settings.businessHours?.endTime || '17:00'}
                  onChange={(e) => updateSettings('businessHours', { ...settings.businessHours, endTime: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Working Days</label>
              <div className="flex flex-wrap gap-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                  const workDays: string[] = settings.businessHours?.workDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
                  const isSelected = workDays.includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => {
                        const updated = isSelected ? workDays.filter((d: string) => d !== day) : [...workDays, day];
                        updateSettings('businessHours', { ...settings.businessHours, workDays: updated });
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* SLA Settings Section */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            SLA Settings
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Response Target (minutes)</label>
              <input
                type="number"
                min={0}
                value={settings.slaFirstResponse || ''}
                onChange={(e) => updateSettings('slaFirstResponse', parseInt(e.target.value, 10) || null)}
                placeholder="e.g. 60"
                className="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Maximum time to first agent response</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Resolution Target (minutes)</label>
              <input
                type="number"
                min={0}
                value={settings.slaResolution || ''}
                onChange={(e) => updateSettings('slaResolution', parseInt(e.target.value, 10) || null)}
                placeholder="e.g. 480"
                className="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Maximum time to ticket resolution</p>
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
                openclawStatus?.connected ? 'bg-green-500' : 'bg-red-500'
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
                <label className="block text-sm font-medium text-gray-900 dark:text-white">Enable AI Agent</label>
                <p className="text-sm text-gray-500 dark:text-gray-400">Turn on AI-powered ticket handling</p>
              </div>
              <button
                onClick={() => updateSettings('openclawEnabled', !settings.openclawEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.openclawEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.openclawEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Mode</label>
              <select
                value={settings.openclawAgentMode || 'copilot'}
                onChange={(e) => updateSettings('openclawAgentMode', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value="copilot">Copilot (drafts for review)</option>
                <option value="autonomous">Autonomous (acts independently)</option>
                <option value="off">Off</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Copilot mode drafts replies for agent review. Autonomous mode sends replies directly.</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">Widget AI Agent</label>
                <p className="text-sm text-gray-500 dark:text-gray-400">AI responds to widget chat messages</p>
              </div>
              <button
                onClick={() => updateSettings('openclawWidgetAgent', !settings.openclawWidgetAgent)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.openclawWidgetAgent ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.openclawWidgetAgent ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">Auto-Triage</label>
                <p className="text-sm text-gray-500 dark:text-gray-400">Automatically triage new tickets with AI</p>
              </div>
              <button
                onClick={() => updateSettings('openclawAutoTriage', !settings.openclawAutoTriage)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.openclawAutoTriage ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.openclawAutoTriage ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confidence Threshold: {((settings.openclawConfidenceThreshold || 0.8) * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                value={settings.openclawConfidenceThreshold || 0.8}
                onChange={(e) => updateSettings('openclawConfidenceThreshold', parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Minimum confidence required for the AI to take autonomous action</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tone Preference</label>
              <select
                value={settings.tonePreference || 'professional'}
                onChange={(e) => updateSettings('tonePreference', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">How the AI agent should communicate with customers</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">AI Reply Rate Limit (per hour)</label>
              <input
                type="number"
                min={1}
                max={50}
                value={settings.openclawRateLimit || 5}
                onChange={(e) => updateSettings('openclawRateLimit', parseInt(e.target.value, 10) || 5)}
                className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Maximum AI-generated replies per ticket per hour in autonomous mode</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">Auto-Suggest Replies</label>
                <p className="text-sm text-gray-500 dark:text-gray-400">Generate AI draft suggestions for all inbound messages in copilot mode</p>
              </div>
              <button
                onClick={() => updateSettings('openclawAutoSuggest', settings.openclawAutoSuggest === false ? true : false)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.openclawAutoSuggest !== false ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.openclawAutoSuggest !== false ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
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
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Current Colors</p>
              <div className="flex gap-4">
                {currentBranding.primary && (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600" style={{ backgroundColor: currentBranding.primary }} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Primary: {currentBranding.primary}</span>
                  </div>
                )}
                {currentBranding.secondary && (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600" style={{ backgroundColor: currentBranding.secondary }} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Secondary: {currentBranding.secondary}</span>
                  </div>
                )}
                {currentBranding.accent && (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600" style={{ backgroundColor: currentBranding.accent }} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Accent: {currentBranding.accent}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleBrandingUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Primary Color</label>
              <input type="color" value={brandingColors.primary || currentBranding.primary || '#3b82f6'} onChange={(e) => setBrandingColors({ ...brandingColors, primary: e.target.value })} className="h-10 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Secondary Color</label>
              <input type="color" value={brandingColors.secondary || currentBranding.secondary || '#6b7280'} onChange={(e) => setBrandingColors({ ...brandingColors, secondary: e.target.value })} className="h-10 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Accent Color</label>
              <input type="color" value={brandingColors.accent || currentBranding.accent || '#8b5cf6'} onChange={(e) => setBrandingColors({ ...brandingColors, accent: e.target.value })} className="h-10 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
            </div>
            <button
              type="submit"
              disabled={updateTenantMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
            >
              {updateTenantMutation.isPending ? 'Updating...' : 'Update Branding'}
            </button>
            {updateTenantMutation.isSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">Settings updated successfully</p>
            )}
            {updateTenantMutation.isError && (
              <p className="text-sm text-red-600 dark:text-red-400">Failed to update settings</p>
            )}
          </form>
        </div>

        {/* Ticket Routing Section */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Ticket Routing
          </h2>

          {routingLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading routing config...</div>
          ) : (
            <div className="space-y-6">
              {/* Enable/Disable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white">Enable Auto-Routing</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Automatically assign new tickets to agents</p>
                </div>
                <button
                  onClick={() =>
                    updateRoutingMutation.mutate({
                      routingEnabled: !routingConfig?.routingEnabled,
                    })
                  }
                  disabled={updateRoutingMutation.isPending}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    routingConfig?.routingEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      routingConfig?.routingEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Agent load overview */}
              {routingAgents && routingAgents.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Current Agent Load
                  </label>
                  <div className="space-y-1.5">
                    {routingAgents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between text-sm px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-md"
                      >
                        <span className="text-gray-900 dark:text-gray-100 font-medium">{agent.name}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {agent.openTickets} open ticket{agent.openTickets !== 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skill-based routing rules */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Routing Rules
                  </label>
                  <button
                    onClick={addRoutingRule}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    + Add Rule
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Rules are evaluated in order — the first match wins. Leave conditions blank to match all tickets.
                </p>

                {activeRules.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400 py-3 text-center border border-dashed border-gray-300 dark:border-gray-600 rounded-md">
                    No rules configured — using global round-robin
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeRules.map((rule, index) => (
                      <div
                        key={index}
                        className="border border-gray-200 dark:border-gray-700 rounded-md p-3 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            Rule {index + 1}
                          </span>
                          <button
                            onClick={() => removeRoutingRule(index)}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Channel</label>
                            <select
                              value={rule.conditions.channel ?? ''}
                              onChange={(e) =>
                                updateRoutingRule(index, {
                                  ...rule,
                                  conditions: { ...rule.conditions, channel: e.target.value || undefined },
                                })
                              }
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              <option value="">Any channel</option>
                              <option value="EMAIL">Email</option>
                              <option value="CHAT">Chat</option>
                              <option value="DISCORD">Discord</option>
                              <option value="TELEGRAM">Telegram</option>
                              <option value="WIDGET">Widget</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Priority</label>
                            <select
                              value={rule.conditions.priority ?? ''}
                              onChange={(e) =>
                                updateRoutingRule(index, {
                                  ...rule,
                                  conditions: { ...rule.conditions, priority: e.target.value || undefined },
                                })
                              }
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              <option value="">Any priority</option>
                              <option value="LOW">Low</option>
                              <option value="NORMAL">Normal</option>
                              <option value="HIGH">High</option>
                              <option value="URGENT">Urgent</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                            Required Tags (comma-separated)
                          </label>
                          <input
                            type="text"
                            value={(rule.conditions.tags ?? []).join(', ')}
                            onChange={(e) => {
                              const tags = e.target.value
                                .split(',')
                                .map((t) => t.trim())
                                .filter(Boolean);
                              updateRoutingRule(index, {
                                ...rule,
                                conditions: { ...rule.conditions, tags: tags.length > 0 ? tags : undefined },
                              });
                            }}
                            placeholder="e.g. billing, refund"
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Assign to Agent ID</label>
                            <input
                              type="text"
                              value={rule.assigneeId ?? ''}
                              onChange={(e) =>
                                updateRoutingRule(index, {
                                  ...rule,
                                  assigneeId: e.target.value || undefined,
                                })
                              }
                              placeholder="Agent user ID"
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Assign to Team ID</label>
                            <input
                              type="text"
                              value={rule.teamId ?? ''}
                              onChange={(e) =>
                                updateRoutingRule(index, {
                                  ...rule,
                                  teamId: e.target.value || undefined,
                                })
                              }
                              placeholder="Team ID"
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(pendingRoutingRules !== null) && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={saveRoutingRules}
                      disabled={updateRoutingMutation.isPending}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
                    >
                      {updateRoutingMutation.isPending ? 'Saving...' : 'Save Rules'}
                    </button>
                    <button
                      onClick={() => setPendingRoutingRules(null)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                    >
                      Discard
                    </button>
                  </div>
                )}

                {updateRoutingMutation.isSuccess && pendingRoutingRules === null && (
                  <p className="mt-2 text-sm text-green-600 dark:text-green-400">Routing rules saved</p>
                )}
                {updateRoutingMutation.isError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">Failed to save routing rules</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Webhooks Section — ADMIN/OWNER only */}
        {(user?.role === 'ADMIN' || user?.role === 'OWNER') && (
          <WebhookSection />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supported webhook event types
// ---------------------------------------------------------------------------
const WEBHOOK_EVENTS = [
  { value: 'ticket.created', label: 'Ticket Created' },
  { value: 'ticket.updated', label: 'Ticket Updated' },
  { value: 'message.created', label: 'Message Created' },
  { value: 'sla.breached', label: 'SLA Breached' },
] as const;

// ---------------------------------------------------------------------------
// WebhookSection
// ---------------------------------------------------------------------------
function WebhookSection() {
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editEvents, setEditEvents] = useState<string[]>([]);

  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  const { data: endpoints = [], isLoading } = useQuery({
    queryKey: ['webhook-endpoints'],
    queryFn: getWebhookEndpoints,
  });

  const createMutation = useMutation({
    mutationFn: createWebhookEndpoint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      setShowForm(false);
      setFormUrl('');
      setFormDescription('');
      setFormEvents([]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WebhookEndpoint> }) =>
      updateWebhookEndpoint(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWebhookEndpoint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
    },
  });

  const toggleEvent = (
    event: string,
    events: string[],
    setEvents: (e: string[]) => void,
  ) => {
    setEvents(
      events.includes(event) ? events.filter((e) => e !== event) : [...events, event],
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUrl || formEvents.length === 0) return;
    createMutation.mutate({
      url: formUrl,
      events: formEvents,
      description: formDescription || undefined,
    });
  };

  const startEdit = (endpoint: WebhookEndpoint) => {
    setEditingId(endpoint.id);
    setEditUrl(endpoint.url);
    setEditDescription(endpoint.description ?? '');
    setEditEvents([...endpoint.events]);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editUrl || editEvents.length === 0) return;
    updateMutation.mutate({
      id: editingId,
      data: { url: editUrl, events: editEvents, description: editDescription || undefined },
    });
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret).catch(() => {});
  };

  const toggleSecret = (id: string) => {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Webhooks</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Register URLs to receive real-time event notifications.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            Add Webhook
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 space-y-4"
        >
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            New Webhook Endpoint
          </h3>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              required
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://your-app.com/webhooks/tickethacker"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              Events <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {WEBHOOK_EVENTS.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formEvents.includes(value)}
                    onChange={() => toggleEvent(value, formEvents, setFormEvents)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600"
                  />
                  <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending || formEvents.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
            >
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormUrl('');
                setFormDescription('');
                setFormEvents([]);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>

          {createMutation.isError && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Failed to create webhook'}
            </p>
          )}
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading webhooks...</p>
      ) : endpoints.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No webhook endpoints configured yet.
        </p>
      ) : (
        <div className="space-y-4">
          {endpoints.map((endpoint) => (
            <div
              key={endpoint.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              <div className="p-4 bg-gray-50 dark:bg-gray-900">
                {editingId === endpoint.id ? (
                  <form onSubmit={handleUpdate} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        URL
                      </label>
                      <input
                        type="url"
                        required
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Events
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {WEBHOOK_EVENTS.map(({ value, label }) => (
                          <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editEvents.includes(value)}
                              onChange={() => toggleEvent(value, editEvents, setEditEvents)}
                              className="rounded border-gray-300 dark:border-gray-600 text-blue-600"
                            />
                            <span className="text-xs text-gray-700 dark:text-gray-300">
                              {label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={updateMutation.isPending || editEvents.length === 0}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
                      >
                        {updateMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm text-gray-900 dark:text-gray-100 break-all">
                          {endpoint.url}
                        </span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                            endpoint.isActive
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {endpoint.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      {endpoint.description && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {endpoint.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1 mt-2">
                        {endpoint.events.map((event) => (
                          <span
                            key={event}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                          >
                            {event}
                          </span>
                        ))}
                      </div>

                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Signing secret:
                        </span>
                        <span className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all">
                          {revealedSecrets.has(endpoint.id)
                            ? endpoint.secret
                            : '•'.repeat(24)}
                        </span>
                        <button
                          onClick={() => toggleSecret(endpoint.id)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {revealedSecrets.has(endpoint.id) ? 'Hide' : 'Reveal'}
                        </button>
                        {revealedSecrets.has(endpoint.id) && (
                          <button
                            onClick={() => copySecret(endpoint.secret)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Copy
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() =>
                          updateMutation.mutate({
                            id: endpoint.id,
                            data: { isActive: !endpoint.isActive },
                          })
                        }
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          endpoint.isActive ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                        title={endpoint.isActive ? 'Disable' : 'Enable'}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            endpoint.isActive ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => startEdit(endpoint)}
                        className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this webhook endpoint?')) {
                            deleteMutation.mutate(endpoint.id);
                          }
                        }}
                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 underline"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() =>
                          setExpandedEndpoint(
                            expandedEndpoint === endpoint.id ? null : endpoint.id,
                          )
                        }
                        className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline"
                      >
                        {expandedEndpoint === endpoint.id ? 'Hide Log' : 'View Log'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {expandedEndpoint === endpoint.id && (
                <DeliveryLog endpointId={endpoint.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeliveryLog
// ---------------------------------------------------------------------------
function DeliveryLog({ endpointId }: { endpointId: string }) {
  const queryClient = useQueryClient();

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ['webhook-deliveries', endpointId],
    queryFn: () => getWebhookDeliveries(endpointId),
  });

  const retryMutation = useMutation({
    mutationFn: retryWebhookDelivery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-deliveries', endpointId] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">Loading delivery log...</p>
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">No deliveries recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <div className="p-3 bg-white dark:bg-gray-800">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Recent Deliveries (last 10)
        </h4>
        <div className="space-y-1.5">
          {deliveries.map((delivery: WebhookDeliveryItem) => (
            <div
              key={delivery.id}
              className="flex items-center gap-3 py-1.5 px-2 rounded text-xs hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${
                  delivery.success
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}
              >
                {delivery.success ? 'OK' : 'FAIL'}
              </span>
              <span className="text-gray-500 dark:text-gray-400 shrink-0 w-8 text-center">
                {delivery.statusCode ?? '—'}
              </span>
              <span className="text-gray-700 dark:text-gray-300 shrink-0">{delivery.event}</span>
              <span className="text-gray-400 dark:text-gray-500 shrink-0">#{delivery.attempt}</span>
              <span className="text-gray-400 dark:text-gray-500 flex-1 text-right">
                {new Date(delivery.deliveredAt).toLocaleString()}
              </span>
              {!delivery.success && (
                <button
                  onClick={() => retryMutation.mutate(delivery.id)}
                  disabled={retryMutation.isPending}
                  className="text-blue-600 dark:text-blue-400 hover:underline shrink-0 disabled:opacity-50"
                >
                  Retry
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
