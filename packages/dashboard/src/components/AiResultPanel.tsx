import { useState } from 'react';
import clsx from 'clsx';
import { type AgentResult, aiSubmitFeedback } from '../lib/api';

interface AiResultPanelProps {
  result: AgentResult;
  ticketId: string;
  onUseReply?: (draftReply: string) => void;
  onDismiss: () => void;
}

const SENTIMENT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  positive: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-300',
    label: 'Positive',
  },
  neutral: {
    bg: 'bg-gray-100 dark:bg-gray-700',
    text: 'text-gray-700 dark:text-gray-300',
    label: 'Neutral',
  },
  negative: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-800 dark:text-orange-300',
    label: 'Negative',
  },
  frustrated: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
    label: 'Frustrated',
  },
  angry: {
    bg: 'bg-red-200 dark:bg-red-900/50',
    text: 'text-red-900 dark:text-red-200 font-semibold',
    label: 'Angry',
  },
};

function getConfidenceBarColor(confidence: number): string {
  const pct = confidence * 100;
  if (pct < 40) return 'bg-red-500';
  if (pct < 70) return 'bg-yellow-500';
  if (pct < 90) return 'bg-green-500';
  return 'bg-emerald-500';
}

function truncateString(value: string, maxLen: number): string {
  return value.length > maxLen ? value.slice(0, maxLen) + '...' : value;
}

function formatToolArgs(args: unknown): string {
  try {
    const str = typeof args === 'string' ? args : JSON.stringify(args);
    return truncateString(str, 80);
  } catch {
    return String(args);
  }
}

function formatToolResult(result: unknown): string {
  try {
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    if (parsed && typeof parsed === 'object') {
      // Pull out a human-readable one-liner from common result shapes
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.message === 'string') return obj.message;
      if (typeof obj.status === 'string') return obj.status;
      if (typeof obj.summary === 'string') return truncateString(obj.summary, 80);
      return truncateString(JSON.stringify(parsed), 80);
    }
    return truncateString(String(parsed), 80);
  } catch {
    return truncateString(String(result), 80);
  }
}

export default function AiResultPanel({
  result,
  ticketId,
  onUseReply,
  onDismiss,
}: AiResultPanelProps) {
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [feedbackPending, setFeedbackPending] = useState(false);

  const confidencePct = Math.round(result.confidence * 100);
  const barColor = getConfidenceBarColor(result.confidence);
  const sentimentStyle = result.sentiment
    ? SENTIMENT_STYLES[result.sentiment] ?? SENTIMENT_STYLES.neutral
    : null;

  const handleFeedback = async (rating: 'positive' | 'negative') => {
    if (feedbackGiven || feedbackPending) return;
    setFeedbackPending(true);
    try {
      await aiSubmitFeedback(ticketId, { action: result.action, rating });
      setFeedbackGiven(true);
    } catch {
      // Feedback submission is non-critical — fail silently
    } finally {
      setFeedbackPending(false);
    }
  };

  return (
    <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
      {/* Header row: action label + dismiss */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
          {result.action}
        </span>
        <button
          onClick={onDismiss}
          className="text-purple-400 hover:text-purple-600 dark:hover:text-purple-200 text-sm leading-none"
          aria-label="Dismiss AI result"
        >
          ×
        </button>
      </div>

      {/* Confidence gauge */}
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-purple-100 dark:bg-purple-900/40 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', barColor)}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
          <span className="text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">
            {confidencePct}% confidence
          </span>
        </div>
      </div>

      {/* Sentiment badge */}
      {sentimentStyle && (
        <div className="mb-2">
          <span
            className={clsx(
              'inline-flex items-center px-2 py-0.5 rounded text-xs',
              sentimentStyle.bg,
              sentimentStyle.text
            )}
          >
            {sentimentStyle.label}
          </span>
        </div>
      )}

      {/* Summary */}
      <p className="text-sm text-purple-800 dark:text-purple-200 mb-2">{result.summary}</p>

      {/* Agent Steps (tool calls) */}
      {result.toolCalls.length > 0 && (
        <div className="mb-2">
          <button
            onClick={() => setStepsExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 transition-colors"
          >
            <svg
              className={clsx('w-3 h-3 transition-transform', stepsExpanded && 'rotate-180')}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="2,4 6,8 10,4" />
            </svg>
            {result.toolCalls.length} step{result.toolCalls.length !== 1 ? 's' : ''} executed
          </button>

          {stepsExpanded && (
            <ol className="mt-2 space-y-2 pl-1">
              {result.toolCalls.map((call, index) => (
                <li key={index} className="flex gap-2 text-xs">
                  <span className="text-purple-400 dark:text-purple-500 shrink-0 font-mono">
                    {index + 1}.
                  </span>
                  <div className="min-w-0">
                    <span className="font-mono text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-1 py-0.5 rounded">
                      {call.tool}
                    </span>
                    {call.args !== undefined && (
                      <p className="mt-0.5 text-purple-500 dark:text-purple-400 truncate">
                        {formatToolArgs(call.args)}
                      </p>
                    )}
                    {call.result !== undefined && (
                      <p className="mt-0.5 text-purple-400 dark:text-purple-500 italic truncate">
                        &rarr; {formatToolResult(call.result)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Draft reply */}
      {result.draftReply && (
        <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded border border-purple-100 dark:border-purple-900">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Draft Reply</p>
          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {result.draftReply}
          </p>
          <div className="mt-2 flex gap-2">
            {onUseReply && (
              <button
                onClick={() => onUseReply(result.draftReply!)}
                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                Use Reply
              </button>
            )}
            <button
              onClick={onDismiss}
              className="px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Feedback buttons */}
      <div className="mt-3 flex items-center gap-2">
        {feedbackGiven ? (
          <span className="text-xs text-purple-500 dark:text-purple-400">Thanks for the feedback</span>
        ) : (
          <>
            <span className="text-xs text-purple-500 dark:text-purple-400">Helpful?</span>
            <button
              onClick={() => handleFeedback('positive')}
              disabled={feedbackPending}
              className="text-purple-400 hover:text-green-600 dark:hover:text-green-400 disabled:opacity-50 transition-colors"
              aria-label="Thumbs up"
              title="This was helpful"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path d="M1 8.25a1.25 1.25 0 1 1 2.5 0v7.5a1.25 1.25 0 0 1-2.5 0v-7.5ZM11 3V1.7c0-.268.14-.526.395-.607A2 2 0 0 1 14 3c0 .995-.182 1.948-.514 2.826-.204.54.166 1.174.744 1.174h2.52c1.243 0 2.261 1.01 2.146 2.247a23.864 23.864 0 0 1-2.096 7.568C16.37 18.168 15.27 19 14 19H7.773c-.787 0-1.537-.322-2.082-.865L4 16.5V8.75a7.5 7.5 0 0 1 2.197-5.302l.44-.44A1 1 0 0 1 7.344 3h.144a1 1 0 0 1 .894.553L9 5h2Z" />
              </svg>
            </button>
            <button
              onClick={() => handleFeedback('negative')}
              disabled={feedbackPending}
              className="text-purple-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
              aria-label="Thumbs down"
              title="This was not helpful"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path d="M18.905 12.75a1.25 1.25 0 0 1-2.5 0v-7.5a1.25 1.25 0 0 1 2.5 0v7.5ZM8.905 17v1.3c0 .268-.14.526-.395.607A2 2 0 0 1 5.905 17c0-.995.182-1.948.514-2.826.204-.54-.166-1.174-.744-1.174h-2.52c-1.243 0-2.261-1.01-2.146-2.247a23.863 23.863 0 0 1 2.096-7.568C3.539 1.832 4.638 1 5.905 1h6.227c.787 0 1.537.322 2.082.865l1.691 1.635V11.25a7.5 7.5 0 0 1-2.197 5.302l-.44.44A1 1 0 0 1 12.56 17h-.143a1 1 0 0 1-.894-.553L10.905 15h-2Z" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
