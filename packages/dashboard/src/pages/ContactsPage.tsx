import { useQuery } from '@tanstack/react-query';
import { getContacts, getContactHealth, type HealthScore } from '../lib/api';
import { useState, useEffect } from 'react';

type SortField = 'name' | 'health' | 'tickets' | 'updated';
type SortOrder = 'asc' | 'desc';

function HealthBadge({ score, level }: { score: number; level: HealthScore['level'] }) {
  const colorMap: Record<HealthScore['level'], string> = {
    healthy: 'bg-green-500',
    at_risk: 'bg-yellow-400',
    critical: 'bg-red-500',
  };

  const labelMap: Record<HealthScore['level'], string> = {
    healthy: 'Healthy',
    at_risk: 'At Risk',
    critical: 'Critical',
  };

  return (
    <div className="flex items-center gap-1.5" title={`${score}/100 — ${labelMap[level]}`}>
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorMap[level]}`} />
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
        {score}
      </span>
    </div>
  );
}

function ContactHealthCell({ contactId }: { contactId: string }) {
  const { data: health, isLoading } = useQuery({
    queryKey: ['contact-health', contactId],
    queryFn: () => getContactHealth(contactId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">...</span>;
  }

  if (!health) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>;
  }

  return <HealthBadge score={health.score} level={health.level} />;
}

export default function ContactsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: contactsData, isLoading, error } = useQuery({
    queryKey: ['contacts', debouncedSearch],
    queryFn: () => getContacts({ search: debouncedSearch || undefined, limit: 50 }),
  });

  const contacts = contactsData?.contacts || [];

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'updated' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="ml-1 text-gray-300 dark:text-gray-600">↕</span>;
    }
    return (
      <span className="ml-1 text-blue-500">
        {sortOrder === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Contacts
        </h1>
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">
            Failed to load contacts: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Loading contacts...
        </div>
      ) : contacts.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => handleSort('name')}
                >
                  Name <SortIcon field="name" />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Channel
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => handleSort('tickets')}
                >
                  Tickets <SortIcon field="tickets" />
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => handleSort('health')}
                >
                  Health <SortIcon field="health" />
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                  onClick={() => handleSort('updated')}
                >
                  Last Updated <SortIcon field="updated" />
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                        {contact.avatarUrl ? (
                          <img
                            src={contact.avatarUrl}
                            alt={contact.name}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          contact.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {contact.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {contact.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 capitalize">
                    {contact.channel}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {contact._count?.tickets || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <ContactHealthCell contactId={contact.id} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {new Date(contact.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No contacts found
        </div>
      )}
    </div>
  );
}
