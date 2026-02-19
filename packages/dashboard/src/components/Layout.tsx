import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { useUIStore } from '../store/ui';
import { connectSocket, disconnectSocket } from '../lib/socket';
import CommandPalette from './CommandPalette';
import { useQuery } from '@tanstack/react-query';
import { getUsers, getSavedViews } from '../lib/api';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

export default function Layout() {
  const navigate = useNavigate();
  const { user, accessToken, logout } = useAuthStore();
  const { darkMode, toggleDarkMode, sidebarOpen, toggleSidebar, toggleCommandPalette } = useUIStore();

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const { data: savedViews } = useQuery({
    queryKey: ['saved-views'],
    queryFn: getSavedViews,
  });

  useEffect(() => {
    if (accessToken) {
      connectSocket(accessToken);
    }

    return () => {
      disconnectSocket();
    };
  }, [accessToken]);

  const handleLogout = () => {
    logout();
    disconnectSocket();
    navigate('/login');
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
    </div>
  );
}
