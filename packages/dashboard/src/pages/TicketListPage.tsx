import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient, useQuery } from '@tanstack/react-query';
import { getTickets, getUsers, bulkUpdateTickets } from '../lib/api';
import { useSocket } from '../lib/socket';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useUIStore } from '../store/ui';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'priority', label: 'Priority' },
  { value: 'sla', label: 'SLA Deadline' },
];

const STATUS_OPTIONS = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITY_OPTIONS = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const CHANNEL_OPTIONS = ['CHAT_WIDGET', 'DISCORD', 'TELEGRAM', 'EMAIL', 'API'];

export default function TicketListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('newest');
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Handle filters from location state
  useEffect(() => {
    if (location.state?.filters) {
      const filters = location.state.filters;
      setStatusFilter(filters.status || []);
      setPriorityFilter(filters.priority || []);
      setChannelFilter(filters.channel || []);
      setFocusedIndex(0);
      setSelectedTicketIds([]);
    }
  }, [location.state]);

  // Reset focusedIndex and selections when filters change
  useEffect(() => {
    setFocusedIndex(0);
    setSelectedTicketIds([]);
  }, [statusFilter, priorityFilter, channelFilter, sortBy]);

  // Infinite query for tickets with proper pagination
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['tickets', statusFilter, priorityFilter, channelFilter, sortBy],
    queryFn: ({ pageParam }) =>
      getTickets({
        status: statusFilter.length > 0 ? statusFilter : undefined,
        priority: priorityFilter.length > 0 ? priorityFilter : undefined,
        channel: channelFilter.length > 0 ? channelFilter : undefined,
        sortBy,
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // Fetch users for bulk assignment
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const users = usersData?.users || [];

  // Socket real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleTicketCreated = () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    };

    const handleTicketUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    };

    socket.on('ticket:created', handleTicketCreated);
    socket.on('ticket:updated', handleTicketUpdated);

    return () => {
      socket.off('ticket:created', handleTicketCreated);
      socket.off('ticket:updated', handleTicketUpdated);
    };
  }, [socket, queryClient]);

  // Flatten all pages into one tickets array
  const tickets = data?.pages.flatMap((page) => page.tickets) || [];

  // Toast notification handler
  const showToast = (type: 'success' | 'error', message: string) => {
    setToastMessage({ type, message });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Handle ticket selection toggle
  const handleToggleSelect = (ticketId: string) => {
    setSelectedTicketIds((prev) =>
      prev.includes(ticketId)
        ? prev.filter((id) => id !== ticketId)
        : [...prev, ticketId]
    );
  };

  // Handle bulk update with correct payload shape
  const handleBulkUpdate = async (updates: {
    status?: string;
    priority?: string;
    assigneeId?: string | null;
    tags?: string[];
  }) => {
    if (selectedTicketIds.length === 0) return;

    try {
      await bulkUpdateTickets(selectedTicketIds, updates);
      setSelectedTicketIds([]);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      showToast('success', `Updated ${selectedTicketIds.length} ticket(s)`);
    } catch (error) {
      console.error('Bulk update failed:', error);
      showToast('error', 'Failed to update tickets');
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    j: () => {
      if (focusedIndex < tickets.length - 1) {
        setFocusedIndex(focusedIndex + 1);
      }
    },
    k: () => {
      if (focusedIndex > 0) {
        setFocusedIndex(focusedIndex - 1);
      }
    },
    Enter: () => {
      if (tickets[focusedIndex]) {
        navigate(`/tickets/${tickets[focusedIndex].id}`);
      }
    },
    x: () => {
      if (tickets[focusedIndex]) {
        handleToggleSelect(tickets[focusedIndex].id);
      }
    },
    'cmd+k': () => {
      useUIStore.getState().toggleCommandPalette();
    },
  });

  // Filter toggle helper
  const toggleFilter = (filter: string[], value: string, setter: (v: string[]) => void) => {
    setter(filter.includes(value) ? filter.filter((v) => v !== value) : [...filter, value]);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={clsx(
            'fixed top-4 right-4 z-50 px-4 py-3 rounded-md shadow-lg text-white text-sm font-medium',
            toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          )}
        >
          {toastMessage.message}
        </div>
      )}

      {/* Header with filters and sort */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tickets</h1>
          <div className="flex items-center gap-4">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  onClick={() => toggleFilter(statusFilter, status, setStatusFilter)}
                  className={clsx(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    statusFilter.includes(status)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Priority
            </label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((priority) => (
                <button
                  key={priority}
                  onClick={() => toggleFilter(priorityFilter, priority, setPriorityFilter)}
                  className={clsx(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    priorityFilter.includes(priority)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  )}
                >
                  {priority}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Channel
            </label>
            <div className="flex gap-2">
              {CHANNEL_OPTIONS.map((channel) => (
                <button
                  key={channel}
                  onClick={() => toggleFilter(channelFilter, channel, setChannelFilter)}
                  className={clsx(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    channelFilter.includes(channel)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  )}
                >
                  {channel}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedTicketIds.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
              {selectedTicketIds.length} ticket{selectedTicketIds.length !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkUpdate({ status: e.target.value });
                    e.target.value = '';
                  }
                }}
                className="px-3 py-1 border border-blue-300 dark:border-blue-700 rounded-md bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              >
                <option value="">Change Status</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkUpdate({ priority: e.target.value });
                    e.target.value = '';
                  }
                }}
                className="px-3 py-1 border border-blue-300 dark:border-blue-700 rounded-md bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              >
                <option value="">Change Priority</option>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkUpdate({ assigneeId: e.target.value });
                    e.target.value = '';
                  }
                }}
                className="px-3 py-1 border border-blue-300 dark:border-blue-700 rounded-md bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              >
                <option value="">Assign To</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Tickets table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            Loading tickets...
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <svg
              className="w-16 h-16 mb-4 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-lg mb-2">Failed to load tickets</p>
            <p className="text-sm mb-4">{error instanceof Error ? error.message : 'Unknown error'}</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <p className="text-lg">No tickets found</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-12">
                  <input
                    type="checkbox"
                    checked={selectedTicketIds.length === tickets.length && tickets.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTicketIds(tickets.map((t) => t.id));
                      } else {
                        setSelectedTicketIds([]);
                      }
                    }}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Subject
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Assignee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Channel
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  SLA
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {tickets.map((ticket, index) => (
                <tr
                  key={ticket.id}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  className={clsx(
                    'cursor-pointer transition-colors',
                    index === focusedIndex
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  )}
                >
                  <td
                    className="px-6 py-4 whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTicketIds.includes(ticket.id)}
                      onChange={() => handleToggleSelect(ticket.id)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                    <div className="max-w-md truncate">{ticket.subject}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {ticket.contact?.name || 'Unknown'}
                      {ticket._count?.messages ? ` · ${ticket._count.messages} messages` : ''}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={ticket.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <PriorityBadge priority={ticket.priority} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {ticket.assignee?.name || 'Unassigned'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {ticket.channel}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {ticket.slaDeadline ? (
                      <span
                        className={clsx(
                          new Date(ticket.slaDeadline) < new Date()
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        {formatDistanceToNow(new Date(ticket.slaDeadline), { addSuffix: true })}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Load more button */}
      {hasNextPage && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFetchingNextPage ? 'Loading more...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
