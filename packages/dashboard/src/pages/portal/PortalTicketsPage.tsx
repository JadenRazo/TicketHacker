import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { portalGetTickets, type PortalTicket } from '../../lib/api';

const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  OPEN: { label: 'Open', classes: 'bg-blue-100 text-blue-700' },
  PENDING: { label: 'Pending', classes: 'bg-yellow-100 text-yellow-700' },
  RESOLVED: { label: 'Resolved', classes: 'bg-green-100 text-green-700' },
  CLOSED: { label: 'Closed', classes: 'bg-gray-100 text-gray-600' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.classes}`}>
      {style.label}
    </span>
  );
}

export default function PortalTicketsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Read contact info stored at login
  const storedContact = (() => {
    try {
      return JSON.parse(localStorage.getItem('portalContact') ?? 'null');
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    const token = localStorage.getItem('portalToken');
    if (!token) {
      navigate(`/portal/${tenantSlug}`, { replace: true });
      return;
    }

    portalGetTickets()
      .then((data) => setTickets(data))
      .catch((err: Error) => {
        if (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized')) {
          localStorage.removeItem('portalToken');
          localStorage.removeItem('portalContact');
          navigate(`/portal/${tenantSlug}`, { replace: true });
          return;
        }
        setError('Failed to load your tickets. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [tenantSlug, navigate]);

  const handleSignOut = () => {
    localStorage.removeItem('portalToken');
    localStorage.removeItem('portalContact');
    navigate(`/portal/${tenantSlug}`, { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                />
              </svg>
            </div>
            <span className="font-semibold text-gray-900">Support Portal</span>
          </div>

          <div className="flex items-center gap-4">
            {storedContact && (
              <span className="text-sm text-gray-500 hidden sm:block">{storedContact.email}</span>
            )}
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">My Tickets</h1>
          {storedContact && (
            <p className="mt-0.5 text-sm text-gray-500">Showing tickets for {storedContact.email}</p>
          )}
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && tickets.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
              <svg
                className="w-6 h-6 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">You have no support tickets yet.</p>
          </div>
        )}

        {!loading && !error && tickets.length > 0 && (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={`/portal/${tenantSlug}/tickets/${ticket.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                      {ticket.subject}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400">
                      <span>
                        Updated {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                      </span>
                      {ticket._count && (
                        <span>{ticket._count.messages} message{ticket._count.messages !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <StatusBadge status={ticket.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
