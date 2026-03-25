import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Command } from 'cmdk';
import { useUIStore } from '../store/ui';
import { useQuery } from '@tanstack/react-query';
import { getTickets, getCannedResponses } from '../lib/api';

export default function CommandPalette() {
  const navigate = useNavigate();
  const location = useLocation();
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const [search, setSearch] = useState('');
  const [notification, setNotification] = useState('');

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['tickets', search],
    queryFn: () => getTickets({ search, limit: 5 }),
    enabled: commandPaletteOpen && search.length > 0,
  });

  const { data: cannedResponses, isLoading: cannedLoading } = useQuery({
    queryKey: ['canned-responses'],
    queryFn: getCannedResponses,
    enabled: commandPaletteOpen,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const handleClose = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setCommandPaletteOpen(false);
    setSearch('');
  };

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(''), 2000);
  };

  if (!commandPaletteOpen) return null;

  const handleSelect = async (value: string) => {
    if (value.startsWith('ticket:')) {
      const ticketId = value.replace('ticket:', '');
      navigate(`/tickets/${ticketId}`);
      handleClose();
    } else if (value.startsWith('action:change-status')) {
      const currentPath = location.pathname;
      const ticketMatch = currentPath.match(/\/tickets\/([^/]+)/);
      if (ticketMatch) {
        navigate(`/tickets/${ticketMatch[1]}`);
      } else {
        navigate('/tickets');
      }
      handleClose();
    } else if (value.startsWith('action:assign')) {
      const currentPath = location.pathname;
      const ticketMatch = currentPath.match(/\/tickets\/([^/]+)/);
      if (ticketMatch) {
        navigate(`/tickets/${ticketMatch[1]}`);
      } else {
        navigate('/tickets');
      }
      handleClose();
    } else if (value.startsWith('action:add-tag')) {
      const currentPath = location.pathname;
      const ticketMatch = currentPath.match(/\/tickets\/([^/]+)/);
      if (ticketMatch) {
        navigate(`/tickets/${ticketMatch[1]}`);
      } else {
        navigate('/tickets');
      }
      handleClose();
    } else if (value.startsWith('canned:')) {
      const responseId = value.replace('canned:', '');
      const response = cannedResponses?.find((r) => r.id === responseId);
      if (response) {
        try {
          await navigator.clipboard.writeText(response.content);
          showNotification('Canned response copied to clipboard');
        } catch (err) {
          showNotification('Failed to copy to clipboard');
        }
      }
      handleClose();
    }
  };

  const handleEscapeKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      handleClose();
    }
  };

  const isLoading = ticketsLoading || cannedLoading;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={handleClose}>
        <div className="fixed left-1/2 top-1/4 -translate-x-1/2 w-full max-w-2xl">
          <Command
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleEscapeKey}
          >
            <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-3">
              <svg
                className="h-5 w-5 text-gray-400"
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
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search tickets, actions, canned responses..."
                className="flex-1 bg-transparent px-3 py-3 text-sm outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
              />
              {isLoading && (
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              )}
            </div>
            <Command.List className="max-h-96 overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No results found.
              </Command.Empty>

              {ticketsData && ticketsData.tickets.length > 0 && (
                <Command.Group
                  heading="Tickets"
                  className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5"
                >
                  {ticketsData.tickets.map((ticket) => (
                    <Command.Item
                      key={ticket.id}
                      value={`ticket:${ticket.id}`}
                      onSelect={handleSelect}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 aria-selected:bg-gray-100 dark:aria-selected:bg-gray-700"
                    >
                      <span className="flex-1 truncate">{ticket.subject}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        #{ticket.id.slice(0, 8)}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group
                heading="Actions"
                className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5 mt-2"
              >
                <Command.Item
                  value="action:change-status"
                  onSelect={handleSelect}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 aria-selected:bg-gray-100 dark:aria-selected:bg-gray-700"
                >
                  Change Status
                </Command.Item>
                <Command.Item
                  value="action:assign"
                  onSelect={handleSelect}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 aria-selected:bg-gray-100 dark:aria-selected:bg-gray-700"
                >
                  Assign Ticket
                </Command.Item>
                <Command.Item
                  value="action:add-tag"
                  onSelect={handleSelect}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 aria-selected:bg-gray-100 dark:aria-selected:bg-gray-700"
                >
                  Add Tag
                </Command.Item>
              </Command.Group>

              {cannedResponses && cannedResponses.length > 0 && (
                <Command.Group
                  heading="Canned Responses"
                  className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5 mt-2"
                >
                  {cannedResponses.slice(0, 5).map((response) => (
                    <Command.Item
                      key={response.id}
                      value={`canned:${response.id}`}
                      onSelect={handleSelect}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 aria-selected:bg-gray-100 dark:aria-selected:bg-gray-700"
                    >
                      <span className="flex-1 truncate">{response.title}</span>
                      {response.shortcut && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          /{response.shortcut}
                        </span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </div>
      </div>

      {notification && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 rounded-lg shadow-lg">
          {notification}
        </div>
      )}
    </>
  );
}
