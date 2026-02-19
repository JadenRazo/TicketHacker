import { useState } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';

interface AiActivityEntry {
  id: string;
  timestamp: string;
  action: string;
  result: {
    action: string;
    confidence: number;
    summary: string;
  };
  triggeredBy: string;
  toolCallCount: number;
  feedback?: {
    rating: 'positive' | 'negative';
  };
}

interface AiActivityTimelineProps {
  metadata: Record<string, any> | null | undefined;
}

const ACTION_STYLES: Record<string, { bg: string; text: string }> = {
  triage: {
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    text: 'text-blue-700 dark:text-blue-300',
  },
  'draft-reply': {
    bg: 'bg-green-100 dark:bg-green-900/40',
    text: 'text-green-700 dark:text-green-300',
  },
  resolve: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  summarize: {
    bg: 'bg-purple-100 dark:bg-purple-900/40',
    text: 'text-purple-700 dark:text-purple-300',
  },
};

const TRIGGER_STYLES: Record<string, { bg: string; text: string }> = {
  manual: {
    bg: 'bg-gray-100 dark:bg-gray-700',
    text: 'text-gray-600 dark:text-gray-400',
  },
  'auto-triage': {
    bg: 'bg-orange-100 dark:bg-orange-900/40',
    text: 'text-orange-700 dark:text-orange-300',
  },
  'auto-reply': {
    bg: 'bg-yellow-100 dark:bg-yellow-900/40',
    text: 'text-yellow-700 dark:text-yellow-300',
  },
  copilot: {
    bg: 'bg-indigo-100 dark:bg-indigo-900/40',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
};

function getConfidenceBadgeStyle(confidence: number): string {
  const pct = confidence * 100;
  if (pct < 40) return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
  if (pct < 70) return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300';
  return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300';
}

function ActivityEntry({ entry }: { entry: AiActivityEntry }) {
  const [expanded, setExpanded] = useState(false);

  const actionStyle = ACTION_STYLES[entry.action] ?? {
    bg: 'bg-gray-100 dark:bg-gray-700',
    text: 'text-gray-600 dark:text-gray-400',
  };
  const triggerStyle = TRIGGER_STYLES[entry.triggeredBy] ?? {
    bg: 'bg-gray-100 dark:bg-gray-700',
    text: 'text-gray-600 dark:text-gray-400',
  };
  const confidenceStyle = getConfidenceBadgeStyle(entry.result.confidence);
  const confidencePct = Math.round(entry.result.confidence * 100);
  const summaryPreview =
    entry.result.summary.length > 100
      ? entry.result.summary.slice(0, 100) + '...'
      : entry.result.summary;

  return (
    <div className="border-l-2 border-purple-200 dark:border-purple-800 pl-3 py-1">
      {/* Timestamp + action badge row */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
          {format(new Date(entry.timestamp), 'MMM d, h:mm a')}
        </span>

        <span
          className={clsx(
            'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
            actionStyle.bg,
            actionStyle.text,
          )}
        >
          {entry.action}
        </span>

        <span
          className={clsx(
            'inline-flex items-center px-1.5 py-0.5 rounded text-xs',
            confidenceStyle,
          )}
        >
          {confidencePct}%
        </span>

        {/* Feedback icon if present */}
        {entry.feedback?.rating === 'positive' && (
          <span className="text-green-500" title="Rated helpful">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M1 8.25a1 1 0 1 1 2 0v5.5a1 1 0 0 1-2 0v-5.5ZM8.75 2.5V1.36c0-.214.112-.42.316-.485A1.6 1.6 0 0 1 11.2 2.4c0 .796-.145 1.558-.411 2.26-.163.432.133.94.595.94h2.016c.995 0 1.809.808 1.717 1.797a19.09 19.09 0 0 1-1.677 6.055C13.096 14.534 12.217 15.2 11.2 15.2H6.218c-.63 0-1.23-.257-1.666-.692L3.2 13.2V8.6a6 6 0 0 1 1.758-4.242l.352-.352A.8.8 0 0 1 5.876 4h.115a.8.8 0 0 1 .715.442L7.52 5.6H9.4a1.35 1.35 0 0 0-.65-1.286V2.5Z" />
            </svg>
          </span>
        )}
        {entry.feedback?.rating === 'negative' && (
          <span className="text-red-400" title="Rated not helpful">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M15 7.75a1 1 0 1 1-2 0v-5.5a1 1 0 0 1 2 0v5.5ZM7.25 13.5v1.14c0 .214-.112.42-.316.485A1.6 1.6 0 0 1 4.8 13.6c0-.796.145-1.558.411-2.26.163-.432-.133-.94-.595-.94H2.6c-.995 0-1.809-.808-1.717-1.797a19.09 19.09 0 0 1 1.677-6.055C2.904 1.466 3.783.8 4.8.8h4.982c.63 0 1.23.257 1.666.692L12.8 2.8v4.6a6 6 0 0 1-1.758 4.242l-.352.352A.8.8 0 0 1 10.124 12h-.115a.8.8 0 0 1-.715-.442L8.48 10.4H6.6c.39.355.65.873.65 1.454v1.646Z" />
            </svg>
          </span>
        )}
      </div>

      {/* Collapsible summary body */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full text-left"
      >
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
          {expanded ? entry.result.summary : summaryPreview}
        </p>
      </button>

      {/* Footer row: trigger pill + tool call count */}
      <div className="flex items-center gap-2 mt-1.5">
        <span
          className={clsx(
            'inline-flex items-center px-1.5 py-0.5 rounded-full text-xs',
            triggerStyle.bg,
            triggerStyle.text,
          )}
        >
          {entry.triggeredBy}
        </span>
        {entry.toolCallCount > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {entry.toolCallCount} tool{entry.toolCallCount !== 1 ? 's' : ''}
          </span>
        )}
        {entry.result.summary.length > 100 && (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="text-xs text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 ml-auto"
          >
            {expanded ? 'less' : 'more'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AiActivityTimeline({ metadata }: AiActivityTimelineProps) {
  const log: AiActivityEntry[] = Array.isArray(metadata?.aiActivityLog)
    ? [...metadata.aiActivityLog].reverse()
    : [];

  if (log.length === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
        No AI activity yet
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {log.map((entry) => (
        <ActivityEntry key={entry.id ?? entry.timestamp} entry={entry} />
      ))}
    </div>
  );
}
