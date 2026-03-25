import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCannedResponses,
  createCannedResponse,
  updateCannedResponse,
  deleteCannedResponse,
  type CannedResponse,
} from '../lib/api';

type Scope = 'PERSONAL' | 'TEAM' | 'TENANT';

interface FormState {
  title: string;
  content: string;
  shortcut: string;
  scope: Scope;
}

const EMPTY_FORM: FormState = {
  title: '',
  content: '',
  shortcut: '',
  scope: 'PERSONAL',
};

const SCOPE_LABELS: Record<string, string> = {
  PERSONAL: 'Personal',
  TEAM: 'Team',
  TENANT: 'Organization',
};

const SCOPE_BADGE: Record<string, string> = {
  PERSONAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  TEAM: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  TENANT: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

export default function CannedResponsesPage() {
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<string>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CannedResponse | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<CannedResponse | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: cannedResponses = [], isLoading, error } = useQuery({
    queryKey: ['canned-responses'],
    queryFn: getCannedResponses,
  });

  const createMutation = useMutation({
    mutationFn: createCannedResponse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canned-responses'] });
      closeModal();
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to create canned response');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateCannedResponse>[1] }) =>
      updateCannedResponse(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canned-responses'] });
      closeModal();
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to update canned response');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCannedResponse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canned-responses'] });
      setDeleteTarget(null);
    },
  });

  const filtered = cannedResponses.filter((r) => {
    const matchesScope = scopeFilter === 'ALL' || r.scope === scopeFilter;
    const search = debouncedSearch.toLowerCase();
    const matchesSearch =
      !search ||
      r.title.toLowerCase().includes(search) ||
      r.content.toLowerCase().includes(search) ||
      (r.shortcut && r.shortcut.toLowerCase().includes(search));
    return matchesScope && matchesSearch;
  });

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(r: CannedResponse) {
    setEditTarget(r);
    setForm({
      title: r.title,
      content: r.content,
      shortcut: r.shortcut || '',
      scope: (r.scope as Scope) || 'PERSONAL',
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.title.trim()) {
      setFormError('Title is required');
      return;
    }
    if (!form.content.trim()) {
      setFormError('Content is required');
      return;
    }

    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      shortcut: form.shortcut.trim() || undefined,
      scope: form.scope,
    };

    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Canned Responses
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage reusable reply templates for your team
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
        >
          New Response
        </button>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by title, content, or shortcut..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">All scopes</option>
          <option value="PERSONAL">Personal</option>
          <option value="TEAM">Team</option>
          <option value="TENANT">Organization</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">
            Failed to load canned responses: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Loading canned responses...
        </div>
      ) : filtered.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shortcut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Scope</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Used</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{r.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xs truncate">{r.content}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {r.shortcut ? (
                      <code className="px-2 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                        {r.shortcut}
                      </code>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SCOPE_BADGE[r.scope] || SCOPE_BADGE['PERSONAL']}`}>
                      {SCOPE_LABELS[r.scope] || r.scope}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{r.usageCount}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(r)} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">Edit</button>
                      <button onClick={() => setDeleteTarget(r)} className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {cannedResponses.length === 0 ? 'No canned responses yet. Create your first one.' : 'No canned responses match your search.'}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editTarget ? 'Edit Canned Response' : 'New Canned Response'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {formError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                  <p className="text-sm text-red-800 dark:text-red-200">{formError}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Welcome greeting" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Type the response content here..." rows={5} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shortcut</label>
                <input type="text" value={form.shortcut} onChange={(e) => setForm({ ...form, shortcut: e.target.value })} placeholder="e.g. /welcome" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Type this shortcut in a reply to quickly insert this response.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scope</label>
                <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as Scope })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="PERSONAL">Personal</option>
                  <option value="TEAM">Team</option>
                  <option value="TENANT">Organization</option>
                </select>
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors">
                  {isSaving ? 'Saving...' : editTarget ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-gray-800 rounded-lg shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Canned Response</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Are you sure you want to delete <span className="font-medium">"{deleteTarget.title}"</span>? This cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors">Cancel</button>
              <button onClick={() => deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 rounded-md transition-colors">
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
