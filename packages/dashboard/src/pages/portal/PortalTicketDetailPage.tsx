import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  portalGetTicket,
  portalReplyToTicket,
  type PortalTicketDetail,
  type PortalMessage,
} from '../../lib/api';

const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  OPEN: { label: 'Open', classes: 'bg-blue-100 text-blue-700' },
  PENDING: { label: 'Pending', classes: 'bg-yellow-100 text-yellow-700' },
  RESOLVED: { label: 'Resolved', classes: 'bg-green-100 text-green-700' },
  CLOSED: { label: 'Closed', classes: 'bg-gray-100 text-gray-600' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.classes}`}
    >
      {style.label}
    </span>
  );
}

function MessageBubble({ message }: { message: PortalMessage }) {
  const isInbound = message.direction === 'INBOUND';

  return (
    <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isInbound
            ? 'bg-gray-100 text-gray-900 rounded-tl-sm'
            : 'bg-blue-600 text-white rounded-tr-sm'
        }`}
      >
        {message.contentHtml ? (
          <div
            className="text-sm leading-relaxed prose prose-sm max-w-none [&>*]:text-inherit"
            dangerouslySetInnerHTML={{ __html: message.contentHtml }}
          />
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.contentText}
          </p>
        )}
        <p
          className={`text-xs mt-1.5 ${
            isInbound ? 'text-gray-400' : 'text-blue-200'
          }`}
        >
          {format(new Date(message.createdAt), 'MMM d, h:mm a')}
        </p>
      </div>
    </div>
  );
}

export default function PortalTicketDetailPage() {
  const { tenantSlug, ticketId } = useParams<{ tenantSlug: string; ticketId: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<PortalTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

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

    if (!ticketId) return;

    portalGetTicket(ticketId)
      .then((data) => setTicket(data))
      .catch((err: Error) => {
        if (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized')) {
          localStorage.removeItem('portalToken');
          localStorage.removeItem('portalContact');
          navigate(`/portal/${tenantSlug}`, { replace: true });
          return;
        }
        setError('Failed to load this ticket.');
      })
      .finally(() => setLoading(false));
  }, [ticketId, tenantSlug, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages]);

  const handleSendReply = async () => {
    if (!replyContent.trim() || !ticketId) return;
    setSendError('');
    setSending(true);

    try {
      const newMessage = await portalReplyToTicket(ticketId, replyContent.trim());
      setReplyContent('');
      // Optimistically add the message and mark ticket open
      setTicket((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status:
            prev.status === 'RESOLVED' || prev.status === 'CLOSED' ? 'OPEN' : prev.status,
          messages: [...prev.messages, newMessage as PortalMessage],
        };
      });
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : 'Failed to send your reply. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('portalToken');
    localStorage.removeItem('portalContact');
    navigate(`/portal/${tenantSlug}`, { replace: true });
  };

  const isClosedOrResolved =
    ticket?.status === 'RESOLVED' || ticket?.status === 'CLOSED';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading ticket...
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center max-w-sm w-full">
          <p className="text-gray-500 text-sm mb-4">{error || 'Ticket not found.'}</p>
          <Link
            to={`/portal/${tenantSlug}/tickets`}
            className="text-sm text-blue-600 hover:underline"
          >
            Back to tickets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
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

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 flex-1 flex flex-col">
        {/* Back link + ticket header */}
        <div className="mb-4">
          <Link
            to={`/portal/${tenantSlug}/tickets`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All tickets
          </Link>

          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-base font-semibold text-gray-900 leading-snug">
                {ticket.subject}
              </h1>
              <StatusBadge status={ticket.status} />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Opened {format(new Date(ticket.createdAt), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>

        {/* Resolved/closed banner */}
        {isClosedOrResolved && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <svg
                className="w-5 h-5 text-green-600 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-green-800 font-medium">
                This ticket has been {ticket.status.toLowerCase()}.
              </p>
            </div>
            <p className="text-xs text-green-600">Reply to reopen it</p>
          </div>
        )}

        {/* Message thread */}
        <div className="bg-white rounded-xl border border-gray-200 flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {ticket.messages.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No messages yet.</p>
            )}
            {ticket.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply box */}
          <div className="border-t border-gray-100 p-4">
            {sendError && (
              <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {sendError}
              </div>
            )}
            <div className="flex gap-3 items-end">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSendReply();
                  }
                }}
                placeholder={
                  isClosedOrResolved
                    ? 'Reply to reopen this ticket...'
                    : 'Write a reply...'
                }
                rows={3}
                className="flex-1 resize-none rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleSendReply}
                disabled={sending || !replyContent.trim()}
                className="flex-shrink-0 inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg transition-colors self-end"
              >
                {sending ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  'Send'
                )}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              Press Ctrl+Enter / Cmd+Enter to send
            </p>
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-gray-400">
        Powered by TicketHacker
      </footer>
    </div>
  );
}
