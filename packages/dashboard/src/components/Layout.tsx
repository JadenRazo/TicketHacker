import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import { useUIStore } from '../store/ui';
import { connectSocket, disconnectSocket } from '../lib/socket';
import CommandPalette from './CommandPalette';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getUsers,
  getSavedViews,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  NotificationItem,
} from '../lib/api';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Layout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, accessToken, logout } = useAuthStore();
  const { darkMode, toggleDarkMode, sidebarOpen, toggleSidebar, toggleCommandPalette } = useUIStore();

  const [bellOpen, setBellOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const { data: savedViews } = useQuery({
    queryKey: ['saved-views'],
    queryFn: getSavedViews,
  });

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadNotificationCount,
    refetchInterval: 60_000,
  });

  const { data: notificationsData, refetch: refetchNotifications } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => getNotifications({ limit: 15 }),
    enabled: bellOpen,
  });

  const unreadCount = unreadData?.count ?? 0;
  const notifications = notificationsData?.notifications ?? [];

  // Show and auto-dismiss toast
  const showToast = useCallback((title: string, body: string) => {
    setToast({ title, body });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Socket connection and notification:new listener
  useEffect(() => {
    if (!accessToken) return;

    const s = connectSocket(accessToken);

    const handler = (data: { userId: string; notification: NotificationItem }) => {
      if (!user || data.userId !== user.id) return;

      // Bump the unread count optimistically
      queryClient.setQueryData(
        ['notifications', 'unread-count'],
        (old: { count: number } | undefined) => ({ count: (old?.count ?? 0) + 1 }),
      );

      // Invalidate the list so it refreshes next time the dropdown opens
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });

      showToast(data.notification.title, data.notification.body);
    };

    s.on('notification:new', handler);

    return () => {
      s.off('notification:new', handler);
      disconnectSocket();
    };
  }, [accessToken, user, queryClient, showToast]);

  // Close bell dropdown on outside click
  useEffect(() => {
    if (!bellOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [bellOpen]);

  const handleLogout = () => {
    logout();
    disconnectSocket();
    navigate('/login');
  };

  const handleBellClick = () => {
    setBellOpen((prev) => {
      if (!prev) refetchNotifications();
      return !prev;
    });
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      await markNotificationRead(n.id).catch(() => null);
      queryClient.setQueryData(
        ['notifications', 'unread-count'],
        (old: { count: number } | undefined) => ({ count: Math.max(0, (old?.count ?? 1) - 1) }),
      );
      queryClient.setQueryData(
        ['notifications', 'list'],
        (old: { notifications: NotificationItem[]; nextCursor?: string } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            notifications: old.notifications.map((item) =>
              item.id === n.id ? { ...item, isRead: true } : item,
            ),
          };
        },
      );
    }

    if (n.ticketId) {
      setBellOpen(false);
      navigate(`/tickets/${n.ticketId}`);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead().catch(() => null);
    queryClient.setQueryData(['notifications', 'unread-count'], { count: 0 });
    queryClient.setQueryData(
      ['notifications', 'list'],
      (old: { notifications: NotificationItem[]; nextCursor?: string } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          notifications: old.notifications.map((item) => ({ ...item, isRead: true })),
        };
      },
    );
  };

  const onlineUsers = usersData?.users?.filter((u) => {
    if (!u.isActive || !u.lastSeenAt) return false;
    const lastSeen = new Date(u.lastSeenAt).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return lastSeen > fiveMinutesAgo;
  }) || [];

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {sidebarOpen && (
        <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              TicketHacker
            </h2>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            <Link
              to="/tickets"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Tickets
            </Link>
            <Link
              to="/contacts"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Contacts
            </Link>
            <Link
              to="/canned-responses"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Canned Responses
            </Link>
            <Link
              to="/automations"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Automations
            </Link>
            <Link
              to="/knowledge-base"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Knowledge Base
            </Link>
            <Link
              to="/analytics"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Analytics
            </Link>
            <Link
              to="/settings"
              className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Settings
            </Link>

            {savedViews && savedViews.length > 0 && (
              <>
                <div className="pt-4 pb-2">
                  <div className="h-px bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-3 py-2">
                  Saved Views
                </div>
                {savedViews.map((view) => (
                  <button
                    key={view.id}
                    onClick={() => navigate('/tickets', { state: { filters: view.filters } })}
                    className="w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    {view.name}
                  </button>
                ))}
              </>
            )}

            {onlineUsers.length > 0 && (
              <>
                <div className="pt-4 pb-2">
                  <div className="h-px bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-3 py-2">
                  Online
                </div>
                {onlineUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span>{u.name}</span>
                  </div>
                ))}
              </>
            )}
          </nav>
        </aside>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Toggle sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            {!sidebarOpen && (
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                TicketHacker
              </h2>
            )}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder={`Search... (${isMac ? 'Cmd' : 'Ctrl'}+K)`}
                className="w-full px-4 py-2 pl-10 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                readOnly
                onClick={toggleCommandPalette}
              />
              <svg
                className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              )}
            </button>

            {/* Notification Bell */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={handleBellClick}
                className="relative p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Notifications"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        No notifications
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                            !n.isRead ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.isRead && (
                              <span className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full bg-blue-500" />
                            )}
                            <div className={`flex-1 min-w-0 ${n.isRead ? 'pl-4' : ''}`}>
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {n.title}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">
                                {n.body}
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                {timeAgo(n.createdAt)}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block text-sm">
                <div className="font-medium text-gray-900 dark:text-white">{user?.name || user?.email}</div>
                <div className="text-gray-500 dark:text-gray-400 text-xs">{user?.role}</div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette />

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 animate-in slide-in-from-bottom-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{toast.title}</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{toast.body}</p>
        </div>
      )}
    </div>
  );
}
