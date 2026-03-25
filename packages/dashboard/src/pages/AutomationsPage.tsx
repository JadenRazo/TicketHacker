import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  type AutomationRule,
} from '../lib/api';

const EMPTY_FORM = {
  name: '',
  conditions: '{}',
  actions: '{}',
  isActive: true,
  priority: 0,
};

type FormState = typeof EMPTY_FORM;

function jsonValid(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

interface RuleFormProps {
  initial?: FormState;
  onSave: (data: FormState) => void;
  onCancel: () => void;
  isPending: boolean;
  error: string | null;
}

function RuleForm({ initial = EMPTY_FORM, onSave, onCancel, isPending, error }: RuleFormProps) {
  const [form, setForm] = useState<FormState>(initial);
  const [conditionsError, setConditionsError] = useState('');
  const [actionsError, setActionsError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let valid = true;

    if (!jsonValid(form.conditions)) {
      setConditionsError('Must be valid JSON');
      valid = false;
    } else {
      setConditionsError('');
    }

    if (!jsonValid(form.actions)) {
      setActionsError('Must be valid JSON');
      valid = false;
    } else {
      setActionsError('');
    }

    if (!form.name.trim()) return;
    if (!valid) return;

    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
        <input type="text" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Auto-close spam tickets" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
        <input type="number" min={0} value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value, 10) || 0 })} className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Higher priority rules run first</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Conditions (JSON)</label>
        <textarea rows={5} value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} spellCheck={false} className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y ${conditionsError ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'}`} />
        {conditionsError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{conditionsError}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Actions (JSON)</label>
        <textarea rows={5} value={form.actions} onChange={(e) => setForm({ ...form, actions: e.target.value })} spellCheck={false} className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y ${actionsError ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'}`} />
        {actionsError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{actionsError}</p>}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setForm({ ...form, isActive: !form.isActive })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isActive ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
        <span className="text-sm text-gray-700 dark:text-gray-300">{form.isActive ? 'Active' : 'Inactive'}</span>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={isPending} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors">
          {isPending ? 'Saving...' : 'Save Rule'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors">Cancel</button>
      </div>
    </form>
  );
}

function ruleToForm(rule: AutomationRule): FormState {
  return {
    name: rule.name,
    conditions: JSON.stringify(rule.conditions, null, 2),
    actions: JSON.stringify(rule.actions, null, 2),
    isActive: rule.isActive,
    priority: rule.priority,
  };
}

export default function AutomationsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: ['automations'],
    queryFn: getAutomationRules,
  });

  const createMutation = useMutation({
    mutationFn: (form: FormState) =>
      createAutomationRule({
        name: form.name.trim(),
        conditions: JSON.parse(form.conditions),
        actions: JSON.parse(form.actions),
        isActive: form.isActive,
        priority: form.priority,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      setShowCreate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: FormState }) =>
      updateAutomationRule(id, {
        name: form.name.trim(),
        conditions: JSON.parse(form.conditions),
        actions: JSON.parse(form.actions),
        isActive: form.isActive,
        priority: form.priority,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      setEditingId(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateAutomationRule(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAutomationRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      setConfirmDeleteId(null);
    },
  });

  const ruleBeingDeleted = rules.find((r) => r.id === confirmDeleteId);

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Automations</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Rules that run automatically when tickets match defined conditions</p>
        </div>
        {!showCreate && (
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">New Rule</button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">Failed to load automations: {error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      )}

      {showCreate && (
        <div className="mb-6 bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">New Automation Rule</h2>
          <RuleForm
            onSave={(form) => createMutation.mutate(form)}
            onCancel={() => { setShowCreate(false); createMutation.reset(); }}
            isPending={createMutation.isPending}
            error={createMutation.isError ? (createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create rule') : null}
          />
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading automations...</div>
      ) : rules.length === 0 && !showCreate ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 shadow rounded-lg">
          <p className="text-gray-500 dark:text-gray-400 mb-3">No automation rules yet</p>
          <button onClick={() => setShowCreate(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Create your first rule</button>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
              {editingId === rule.id ? (
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Edit Rule</h2>
                  <RuleForm
                    initial={ruleToForm(rule)}
                    onSave={(form) => updateMutation.mutate({ id: rule.id, form })}
                    onCancel={() => { setEditingId(null); updateMutation.reset(); }}
                    isPending={updateMutation.isPending}
                    error={updateMutation.isError ? (updateMutation.error instanceof Error ? updateMutation.error.message : 'Failed to update rule') : null}
                  />
                </div>
              ) : (
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">{rule.name}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${rule.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {rule.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Created {new Date(rule.createdAt).toLocaleDateString()}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Conditions</p>
                          <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-auto max-h-24 font-mono">{JSON.stringify(rule.conditions, null, 2)}</pre>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Actions</p>
                          <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-auto max-h-24 font-mono">{JSON.stringify(rule.actions, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
                        disabled={toggleMutation.isPending}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 ${rule.isActive ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rule.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => setEditingId(rule.id)} className="text-xs px-3 py-1.5 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors">Edit</button>
                        <button onClick={() => setConfirmDeleteId(rule.id)} className="text-xs px-3 py-1.5 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-md transition-colors">Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDeleteId && ruleBeingDeleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete automation rule?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">"{ruleBeingDeleted.name}" will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteMutation.mutate(confirmDeleteId)} disabled={deleteMutation.isPending} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 rounded-md transition-colors">
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
              <button onClick={() => { setConfirmDeleteId(null); deleteMutation.reset(); }} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
