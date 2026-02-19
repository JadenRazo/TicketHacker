import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { useUIStore } from '../store/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTenant, updateTenant, getOpenClawStatus, updateCurrentUser } from '../lib/api';

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
      </div>
    </div>
  );
}
