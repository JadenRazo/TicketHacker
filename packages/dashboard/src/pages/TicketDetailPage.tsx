import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  getTicket,
  getMessages,
  createMessage,
  updateTicket,
  getUsers,
  getCannedResponses,
  getMacros,
  executeMacro,
  snoozeTicket,
  mergeTickets,
  getTickets,
  aiTriageTicket,
  aiDraftReply,
  aiResolveTicket,
  aiSummarizeTicket,
  type Ticket,
  type Message,
  type AgentResult,
} from '../lib/api';
import { useTicketRoom, emitTyping } from '../lib/socket';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useAuthStore } from '../store/auth';
import {
  formatDistanceToNow,
  format,
  addHours,
  addDays,
  setHours,
  setMinutes,
  startOfTomorrow,
  startOfWeek,
} from 'date-fns';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import clsx from 'clsx';

const STATUS_OPTIONS = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITY_OPTIONS = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const [messageType, setMessageType] = useState<'TEXT' | 'NOTE'>('TEXT');
  const [showCannedResponses, setShowCannedResponses] = useState(false);
  const [cannedSearchTerm, setCannedSearchTerm] = useState('');
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeSearchTerm, setMergeSearchTerm] = useState('');
  const [selectedMergeTicket, setSelectedMergeTicket] = useState<Ticket | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [newTag, setNewTag] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [aiResult, setAiResult] = useState<AgentResult | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);

  const {
    data: ticket,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id!),
    enabled: !!id,
    retry: 1,
  });

  const { data: messagesData } = useQuery({
    queryKey: ['messages', id],
    queryFn: async () => {
      const result = await getMessages(id!);
      return result.messages;
    },
    enabled: !!id,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const result = await getUsers();
      return result.users;
    },
  });

  const { data: cannedResponses } = useQuery({
    queryKey: ['canned-responses'],
    queryFn: getCannedResponses,
  });

  const { data: macros } = useQuery({
    queryKey: ['macros'],
    queryFn: getMacros,
  });

  const { data: mergeSearchResults } = useQuery({
    queryKey: ['ticket-search', mergeSearchTerm],
    queryFn: async () => {
      if (!mergeSearchTerm || mergeSearchTerm.length < 2) {
        return { tickets: [], nextCursor: null };
      }
      return getTickets({ search: mergeSearchTerm, limit: 5 });
    },
    enabled: showMergeDialog && mergeSearchTerm.length >= 2,
  });

  const { viewers, typingUsers } = useTicketRoom(id);

  const createMessageMutation = useMutation({
    mutationFn: async (data: { content: string; messageType: 'TEXT' | 'NOTE' }) => {
      return createMessage(id!, {
        contentHtml: data.content,
        messageType: data.messageType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      editor?.commands.clearContent();
      showToast('Message sent successfully', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to send message', 'error');
    },
  });

  const updateTicketMutation = useMutation({
    mutationFn: (data: Partial<Ticket>) => updateTicket(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      showToast('Ticket updated successfully', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to update ticket', 'error');
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: (until: string) => snoozeTicket(id!, until),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setShowSnoozeMenu(false);
      showToast('Ticket snoozed successfully', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to snooze ticket', 'error');
    },
  });

  const mergeMutation = useMutation({
    mutationFn: (targetTicketId: string) => mergeTickets(id!, targetTicketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setShowMergeDialog(false);
      setSelectedMergeTicket(null);
      setMergeSearchTerm('');
      showToast('Tickets merged successfully', 'success');
      navigate('/tickets');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to merge tickets', 'error');
    },
  });

  const executeMacroMutation = useMutation({
    mutationFn: (macroId: string) => executeMacro(macroId, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      showToast('Macro executed successfully', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to execute macro', 'error');
    },
  });

  const aiTriageMutation = useMutation({
    mutationFn: () => aiTriageTicket(id!),
    onSuccess: (data) => {
      setAiResult(data.result);
      setShowAiPanel(true);
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      showToast('AI triage completed', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'AI triage failed', 'error');
    },
  });

  const aiReplyMutation = useMutation({
    mutationFn: () => aiDraftReply(id!),
    onSuccess: (data) => {
      setAiResult(data.result);
      setShowAiPanel(true);
      if (data.result.draftReply && editor) {
        editor.commands.setContent(data.result.draftReply);
      }
      showToast('AI draft reply generated', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'AI draft reply failed', 'error');
    },
  });

  const aiResolveMutation = useMutation({
    mutationFn: () => aiResolveTicket(id!),
    onSuccess: (data) => {
      setAiResult(data.result);
      setShowAiPanel(true);
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
      showToast(`AI resolve: ${data.result.action}`, 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'AI resolve failed', 'error');
    },
  });

  const aiSummarizeMutation = useMutation({
    mutationFn: () => aiSummarizeTicket(id!),
    onSuccess: (data) => {
      setAiResult(data.result);
      setShowAiPanel(true);
      showToast('AI summary generated', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'AI summarize failed', 'error');
    },
  });

  const isAiLoading =
    aiTriageMutation.isPending ||
    aiReplyMutation.isPending ||
    aiResolveMutation.isPending ||
    aiSummarizeMutation.isPending;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: messageType === 'NOTE' ? 'Add an internal note...' : 'Type your reply...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[100px] px-4 py-3',
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      if (text.startsWith('/')) {
        setCannedSearchTerm(text.slice(1));
        setShowCannedResponses(true);
      } else {
        setShowCannedResponses(false);
        setCannedSearchTerm('');
      }

      if (id) {
        emitTyping(id);
      }
    },
  });

  useEffect(() => {
    if (editor) {
      editor.extensionManager.extensions.forEach((ext) => {
        if (ext.name === 'placeholder') {
          ext.options['placeholder'] =
            messageType === 'NOTE' ? 'Add an internal note...' : 'Type your reply...';
        }
      });
    }
  }, [messageType, editor]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useKeyboardShortcuts({
    r: () => {
      editor?.commands.focus();
    },
    n: () => {
      setMessageType((prev) => (prev === 'NOTE' ? 'TEXT' : 'NOTE'));
    },
    Escape: () => {
      if (showMergeDialog) {
        setShowMergeDialog(false);
      } else if (showSnoozeMenu) {
        setShowSnoozeMenu(false);
      } else {
        navigate('/tickets');
      }
    },
  });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const handleSendMessage = () => {
    const content = editor?.getHTML();
    if (!content || content === '<p></p>') return;

    createMessageMutation.mutate({ content, messageType });
  };

  const handleInsertCannedResponse = (response: string) => {
    editor?.commands.setContent(response);
    setShowCannedResponses(false);
  };

  const handleSnooze = (option: string) => {
    let until: Date;
    const now = new Date();

    switch (option) {
      case '1hour':
        until = addHours(now, 1);
        break;
      case '4hours':
        until = addHours(now, 4);
        break;
      case 'tomorrow':
        until = setMinutes(setHours(startOfTomorrow(), 9), 0);
        break;
      case 'nextweek':
        until = setMinutes(setHours(addDays(startOfWeek(now), 7), 9), 0);
        break;
      default:
        return;
    }

    snoozeMutation.mutate(until.toISOString());
  };

  const handleMergeConfirm = () => {
    if (!selectedMergeTicket) return;

    if (
      window.confirm(
        `Are you sure you want to merge ticket #${ticket?.id.slice(-8)} into #${selectedMergeTicket.id.slice(-8)}? This cannot be undone.`
      )
    ) {
      mergeMutation.mutate(selectedMergeTicket.id);
    }
  };

  const handleAddTag = () => {
    if (!newTag.trim() || !ticket) return;

    const currentTags = ticket.tags || [];
    if (!currentTags.includes(newTag.trim())) {
      updateTicketMutation.mutate({
        tags: [...currentTags, newTag.trim()],
      });
    }
    setNewTag('');
    setShowTagInput(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!ticket) return;
    const currentTags = ticket.tags || [];
    updateTicketMutation.mutate({
      tags: currentTags.filter((tag) => tag !== tagToRemove),
    });
  };

  const filteredCannedResponses =
    cannedResponses?.filter(
      (cr) =>
        cr.title.toLowerCase().includes(cannedSearchTerm.toLowerCase()) ||
        cr.shortcut?.toLowerCase().includes(cannedSearchTerm.toLowerCase())
    ) || [];

  const otherViewers = viewers.filter((v) => v.userId !== user?.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <div className="mb-2">Loading ticket...</div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <div className="text-red-600 dark:text-red-400 mb-4">
            {error instanceof Error ? error.message : 'Failed to load ticket'}
          </div>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
          >
            Retry
          </button>
          <button
            onClick={() => navigate('/tickets')}
            className="ml-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm"
          >
            Back to Tickets
          </button>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <div className="mb-4">Ticket not found</div>
          <button
            onClick={() => navigate('/tickets')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
          >
            Back to Tickets
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {toast && (
        <div
          className={clsx(
            'fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all',
            toast.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          )}
        >
          {toast.message}
        </div>
      )}

      <div className="flex-1 flex flex-col w-2/3 border-r border-gray-200 dark:border-gray-700">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
          <button
            onClick={() => navigate('/tickets')}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-2"
          >
            ← Back to tickets
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{ticket.subject}</h1>
          <div className="flex items-center gap-2 mt-2 text-sm text-gray-600 dark:text-gray-400">
            <span>{ticket.contact?.name || 'Unknown'}</span>
            <span>·</span>
            <span>{ticket.contact?.email || ''}</span>
          </div>
        </div>

        {otherViewers.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-200">
            {otherViewers.map((v) => v.name).join(', ')}{' '}
            {otherViewers.length === 1 ? 'is' : 'are'} viewing this ticket
          </div>
        )}

        {ticket.snoozedUntil && new Date(ticket.snoozedUntil) > new Date() && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-2 text-sm text-blue-800 dark:text-blue-200">
            Snoozed until {format(new Date(ticket.snoozedUntil), 'MMM d, yyyy h:mm a')}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messagesData?.map((message) => {
            const isInbound = message.direction === 'INBOUND';
            const isNote = message.messageType === 'NOTE';
            const isSystem = message.messageType === 'SYSTEM';
            const isAiSuggestion = message.messageType === 'AI_SUGGESTION';

            const senderName = isInbound
              ? message.contact?.name || ticket.contact?.name || 'Unknown'
              : message.sender?.name || 'Agent';

            return (
              <div
                key={message.id}
                className={clsx(
                  'flex',
                  isSystem || isAiSuggestion ? 'justify-center' : isInbound ? 'justify-start' : 'justify-end'
                )}
              >
                <div
                  className={clsx(
                    'rounded-lg p-4',
                    isSystem || isAiSuggestion
                      ? 'max-w-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-center'
                      : 'max-w-2xl',
                    isNote
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                      : isInbound
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                      : !isSystem && !isAiSuggestion
                      ? 'bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600'
                      : ''
                  )}
                >
                  {isSystem || isAiSuggestion ? (
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {format(new Date(message.createdAt), 'MMM d, h:mm a')}
                      </div>
                      <div
                        className="text-sm text-gray-700 dark:text-gray-300"
                        dangerouslySetInnerHTML={{
                          __html: message.contentHtml || message.contentText || '',
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div
                        className={clsx(
                          'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0',
                          isNote
                            ? 'bg-yellow-500'
                            : isInbound
                            ? 'bg-blue-500'
                            : 'bg-gray-500'
                        )}
                      >
                        {senderName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {senderName}
                          </span>
                          {isNote && (
                            <span className="text-xs text-yellow-700 dark:text-yellow-300">
                              (Internal Note)
                            </span>
                          )}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {format(new Date(message.createdAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200"
                          dangerouslySetInnerHTML={{
                            __html: message.contentHtml || message.contentText || '',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />

          {typingUsers.length > 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400 italic">
              {typingUsers.map((u) => u.name).join(', ')}{' '}
              {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setMessageType('TEXT')}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                messageType === 'TEXT'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              Reply
            </button>
            <button
              onClick={() => setMessageType('NOTE')}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                messageType === 'NOTE'
                  ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              Note
            </button>
          </div>

          <div className="relative" ref={editorRef}>
            <EditorContent
              editor={editor}
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />

            {showCannedResponses && filteredCannedResponses.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto z-10">
                {filteredCannedResponses.map((cr) => (
                  <button
                    key={cr.id}
                    onClick={() => handleInsertCannedResponse(cr.content)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">{cr.title}</div>
                    {cr.shortcut && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">/{cr.shortcut}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => editor?.chain().focus().toggleBold().run()}
                className={clsx(
                  'p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700',
                  editor?.isActive('bold') && 'bg-gray-200 dark:bg-gray-700'
                )}
                title="Bold"
              >
                <span className="font-bold text-sm">B</span>
              </button>
              <button
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                className={clsx(
                  'p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700',
                  editor?.isActive('italic') && 'bg-gray-200 dark:bg-gray-700'
                )}
                title="Italic"
              >
                <span className="italic text-sm">I</span>
              </button>
            </div>

            <button
              onClick={handleSendMessage}
              disabled={createMessageMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-md transition-colors"
            >
              {createMessageMutation.isPending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      <div className="w-1/3 bg-white dark:bg-gray-800 p-6 overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Ticket Details</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <select
              value={ticket.status}
              onChange={(e) => updateTicketMutation.mutate({ status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              disabled={updateTicketMutation.isPending}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Priority
            </label>
            <select
              value={ticket.priority}
              onChange={(e) => updateTicketMutation.mutate({ priority: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              disabled={updateTicketMutation.isPending}
            >
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Assignee
            </label>
            <select
              value={ticket.assigneeId || ''}
              onChange={(e) =>
                updateTicketMutation.mutate({
                  assigneeId: e.target.value || null,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              disabled={updateTicketMutation.isPending}
            >
              <option value="">Unassigned</option>
              {usersData?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Channel
            </label>
            <div className="text-sm text-gray-900 dark:text-gray-100 px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-md">
              {ticket.channel}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {ticket.tags?.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                    title="Remove tag"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {showTagInput ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddTag();
                    }
                  }}
                  placeholder="Enter tag name"
                  className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  autoFocus
                />
                <button
                  onClick={handleAddTag}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowTagInput(false);
                    setNewTag('');
                  }}
                  className="px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowTagInput(true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                + Add tag
              </button>
            )}
          </div>

          {ticket.slaDeadline && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                SLA Deadline
              </label>
              <div
                className={clsx(
                  'text-sm px-3 py-2 rounded-md',
                  new Date(ticket.slaDeadline) < new Date()
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    : 'bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100'
                )}
              >
                {format(new Date(ticket.slaDeadline), 'MMM d, yyyy h:mm a')}
                <div className="text-xs mt-1">
                  {formatDistanceToNow(new Date(ticket.slaDeadline), { addSuffix: true })}
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <div>Created: {format(new Date(ticket.createdAt), 'MMM d, yyyy h:mm a')}</div>
              <div>
                Updated: {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-2">
            <div className="relative">
              <button
                onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 text-sm font-medium rounded-md transition-colors"
                disabled={snoozeMutation.isPending}
              >
                {snoozeMutation.isPending ? 'Snoozing...' : 'Snooze'}
              </button>
              {showSnoozeMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden z-10">
                  <button
                    onClick={() => handleSnooze('1hour')}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    1 hour
                  </button>
                  <button
                    onClick={() => handleSnooze('4hours')}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    4 hours
                  </button>
                  <button
                    onClick={() => handleSnooze('tomorrow')}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    Tomorrow 9am
                  </button>
                  <button
                    onClick={() => handleSnooze('nextweek')}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    Next week
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowMergeDialog(true)}
              className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 text-sm font-medium rounded-md transition-colors"
            >
              Merge
            </button>

            <div>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    executeMacroMutation.mutate(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                disabled={executeMacroMutation.isPending}
                defaultValue=""
              >
                <option value="" disabled>
                  {executeMacroMutation.isPending ? 'Running macro...' : 'Run Macro'}
                </option>
                {macros?.map((macro) => (
                  <option key={macro.id} value={macro.id}>
                    {macro.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              AI Actions
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => aiTriageMutation.mutate()}
                disabled={isAiLoading}
                className="w-full px-3 py-2 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {aiTriageMutation.isPending ? 'Triaging...' : 'AI Triage'}
              </button>
              <button
                onClick={() => aiReplyMutation.mutate()}
                disabled={isAiLoading}
                className="w-full px-3 py-2 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {aiReplyMutation.isPending ? 'Drafting...' : 'AI Draft Reply'}
              </button>
              <button
                onClick={() => aiResolveMutation.mutate()}
                disabled={isAiLoading}
                className="w-full px-3 py-2 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {aiResolveMutation.isPending ? 'Resolving...' : 'AI Resolve'}
              </button>
              <button
                onClick={() => aiSummarizeMutation.mutate()}
                disabled={isAiLoading}
                className="w-full px-3 py-2 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {aiSummarizeMutation.isPending ? 'Summarizing...' : 'AI Summarize'}
              </button>
            </div>

            {showAiPanel && aiResult && (
              <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-purple-700 dark:text-purple-300 uppercase">
                    {aiResult.action}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-purple-600 dark:text-purple-400">
                      {(aiResult.confidence * 100).toFixed(0)}% confidence
                    </span>
                    <button
                      onClick={() => setShowAiPanel(false)}
                      className="text-purple-400 hover:text-purple-600 dark:hover:text-purple-200 text-xs"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <p className="text-sm text-purple-800 dark:text-purple-200">
                  {aiResult.summary}
                </p>
                {aiResult.draftReply && (
                  <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded border border-purple-100 dark:border-purple-900">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Draft Reply
                    </p>
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                      {aiResult.draftReply}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          if (editor && aiResult.draftReply) {
                            editor.commands.setContent(aiResult.draftReply);
                          }
                        }}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Use Reply
                      </button>
                      <button
                        onClick={() => setShowAiPanel(false)}
                        className="px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
                {aiResult.toolCalls.length > 0 && (
                  <p className="mt-1 text-xs text-purple-500 dark:text-purple-400">
                    {aiResult.toolCalls.length} tool call{aiResult.toolCalls.length !== 1 ? 's' : ''} executed
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showMergeDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Merge Ticket</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Search for the ticket you want to merge this ticket into
              </p>
            </div>

            <div className="p-6">
              <input
                type="text"
                value={mergeSearchTerm}
                onChange={(e) => setMergeSearchTerm(e.target.value)}
                placeholder="Search tickets by subject or ID..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                autoFocus
              />

              <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                {mergeSearchResults?.tickets
                  .filter((t) => t.id !== id)
                  .map((searchTicket) => (
                    <button
                      key={searchTicket.id}
                      onClick={() => setSelectedMergeTicket(searchTicket)}
                      className={clsx(
                        'w-full text-left p-4 rounded-lg border transition-colors',
                        selectedMergeTicket?.id === searchTicket.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                      )}
                    >
                      <div className="font-medium text-gray-900 dark:text-white">
                        {searchTicket.subject}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        #{searchTicket.id.slice(-8)} · {searchTicket.status} · {searchTicket.priority}
                      </div>
                    </button>
                  ))}
                {mergeSearchTerm && mergeSearchTerm.length >= 2 && !mergeSearchResults?.tickets.length && (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                    No tickets found
                  </div>
                )}
                {(!mergeSearchTerm || mergeSearchTerm.length < 2) && (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                    Type at least 2 characters to search
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowMergeDialog(false);
                  setSelectedMergeTicket(null);
                  setMergeSearchTerm('');
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-md text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMergeConfirm}
                disabled={!selectedMergeTicket || mergeMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
              >
                {mergeMutation.isPending ? 'Merging...' : 'Merge Tickets'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
