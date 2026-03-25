import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getArticles,
  createArticle,
  updateArticle,
  deleteArticle,
  publishArticle,
  archiveArticle,
  type Article,
} from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'ALL' | 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface ArticleFormState {
  title: string;
  content: string;
  category: string;
  tags: string;
}

const EMPTY_FORM: ArticleFormState = {
  title: '',
  content: '',
  category: '',
  tags: '',
};

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  PUBLISHED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  ARCHIVED: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

// ---------------------------------------------------------------------------
// Article editor modal
// ---------------------------------------------------------------------------

interface EditorModalProps {
  article: Article | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditorModal({ article, onClose, onSaved }: EditorModalProps) {
  const isEdit = !!article;
  const [form, setForm] = useState<ArticleFormState>(
    article
      ? {
          title: article.title,
          content: article.content,
          category: article.category ?? '',
          tags: article.tags.join(', '),
        }
      : EMPTY_FORM,
  );
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (data: ArticleFormState) => {
      const payload = {
        title: data.title.trim(),
        content: data.content.trim(),
        category: data.category.trim() || undefined,
        tags: data.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };

      if (isEdit && article) {
        return updateArticle(article.id, payload);
      }
      return createArticle(payload);
    },
    onSuccess: () => {
      onSaved();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to save article');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    if (!form.content.trim()) {
      setError('Content is required');
      return;
    }
    saveMutation.mutate(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Article' : 'New Article'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. How to reset your password"
                maxLength={300}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Content
              </label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Write the article content here..."
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Billing"
                  maxLength={200}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tags
                </label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="e.g. account, security"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Comma-separated</p>
              </div>
            </div>

            {isEdit && article && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span>{article.viewCount} views</span>
                  <span>{article.helpfulCount} helpful</span>
                  <span>{article.notHelpfulCount} not helpful</span>
                  <span>
                    Updated {new Date(article.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
            >
              {saveMutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm modal
// ---------------------------------------------------------------------------

interface DeleteModalProps {
  article: Article;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteModal({ article, onClose, onDeleted }: DeleteModalProps) {
  const deleteMutation = useMutation({
    mutationFn: () => deleteArticle(article.id),
    onSuccess: onDeleted,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Article</h2>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Are you sure you want to delete{' '}
            <span className="font-medium">"{article.title}"</span>? This cannot be undone.
          </p>
          {deleteMutation.isError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message
                : 'Failed to delete article'}
            </p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 rounded-md transition-colors"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Article card
// ---------------------------------------------------------------------------

interface ArticleCardProps {
  article: Article;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
  onArchive: () => void;
  isActing: boolean;
}

function ArticleCard({
  article,
  onEdit,
  onDelete,
  onPublish,
  onArchive,
  isActing,
}: ArticleCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
              {article.title}
            </h3>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                STATUS_BADGE[article.status] ?? STATUS_BADGE['DRAFT']
              }`}
            >
              {article.status.charAt(0) + article.status.slice(1).toLowerCase()}
            </span>
          </div>
          {article.category && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{article.category}</p>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
            {article.content}
          </p>
        </div>
      </div>

      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {article.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>{article.viewCount} views</span>
          <span>{article.helpfulCount} helpful</span>
          <span>{article.notHelpfulCount} not helpful</span>
          <span>{new Date(article.updatedAt).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="text-xs px-3 py-1.5 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
          >
            Edit
          </button>
          {article.status !== 'PUBLISHED' && (
            <button
              onClick={onPublish}
              disabled={isActing}
              className="text-xs px-3 py-1.5 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-md transition-colors disabled:opacity-60"
            >
              Publish
            </button>
          )}
          {article.status !== 'ARCHIVED' && (
            <button
              onClick={onArchive}
              disabled={isActing}
              className="text-xs px-3 py-1.5 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 rounded-md transition-colors disabled:opacity-60"
            >
              Archive
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-xs px-3 py-1.5 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-md transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PUBLISHED', label: 'Published' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'ARCHIVED', label: 'Archived' },
];

export default function KnowledgeBasePage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Article | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Article | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryParams = {
    status: activeTab !== 'ALL' ? activeTab : undefined,
    search: debouncedSearch || undefined,
  };

  const { data: articles = [], isLoading, error } = useQuery({
    queryKey: ['articles', queryParams],
    queryFn: () => getArticles(queryParams),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => publishArticle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveArticle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
  });

  function openCreate() {
    setEditTarget(null);
    setEditorOpen(true);
  }

  function openEdit(article: Article) {
    setEditTarget(article);
    setEditorOpen(true);
  }

  function handleSaved() {
    queryClient.invalidateQueries({ queryKey: ['articles'] });
    setEditorOpen(false);
    setEditTarget(null);
  }

  function handleDeleted() {
    queryClient.invalidateQueries({ queryKey: ['articles'] });
    setDeleteTarget(null);
  }

  const actingId =
    (publishMutation.isPending && publishMutation.variables) ||
    (archiveMutation.isPending && archiveMutation.variables) ||
    null;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Knowledge Base</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage help articles with AI-powered vector search
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
        >
          New Article
        </button>
      </div>

      {/* Tabs + search */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search articles..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 max-w-sm px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">
            Failed to load articles:{' '}
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Loading articles...
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 shadow rounded-lg">
          <p className="text-gray-500 dark:text-gray-400 mb-3">
            {debouncedSearch
              ? 'No articles match your search.'
              : 'No articles yet.'}
          </p>
          {!debouncedSearch && (
            <button
              onClick={openCreate}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Create your first article
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              onEdit={() => openEdit(article)}
              onDelete={() => setDeleteTarget(article)}
              onPublish={() => publishMutation.mutate(article.id)}
              onArchive={() => archiveMutation.mutate(article.id)}
              isActing={actingId === article.id}
            />
          ))}
        </div>
      )}

      {editorOpen && (
        <EditorModal
          article={editTarget}
          onClose={() => {
            setEditorOpen(false);
            setEditTarget(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          article={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
