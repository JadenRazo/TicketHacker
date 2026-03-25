import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getAnalyticsOverview,
  getAnalyticsTrends,
  getAnalyticsAgents,
  getAnalyticsTags,
  type AnalyticsOverview,
  type AnalyticsTrends,
  type AnalyticsAgents,
  type AnalyticsTags,
} from '../lib/api';

type Period = '7d' | '30d' | '90d';

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  CHAT_WIDGET: 'Chat Widget',
  DISCORD: 'Discord',
  TELEGRAM: 'Telegram',
  API: 'API',
};

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-orange-400',
  NORMAL: 'bg-blue-500',
  LOW: 'bg-gray-400',
};

const PRIORITY_TEXT_COLORS: Record<string, string> = {
  URGENT: 'text-red-600 dark:text-red-400',
  HIGH: 'text-orange-600 dark:text-orange-400',
  NORMAL: 'text-blue-600 dark:text-blue-400',
  LOW: 'text-gray-500 dark:text-gray-400',
};

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatMinutes(m: number): string {
  if (m < 1) return '<1m';
  if (m < 60) return `${Math.round(m)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

// ---- Sub-components ----

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent ?? 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>
      )}
    </div>
  );
}

function SlaCard({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const accent =
    pct >= 90
      ? 'text-green-600 dark:text-green-400'
      : pct >= 70
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400';
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">SLA Compliance</p>
      <p className={`mt-2 text-3xl font-bold ${accent}`}>{pct}%</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {pct >= 90 ? 'On track' : pct >= 70 ? 'Needs attention' : 'Critical'}
      </p>
    </div>
  );
}

function CsatCard({ avg }: { avg: number }) {
  const filled = Math.round(avg);
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">CSAT Average</p>
      <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
        {avg > 0 ? avg.toFixed(1) : '—'}
      </p>
      {avg > 0 && (
        <div className="mt-1 flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <svg
              key={i}
              className={`w-4 h-4 ${i < filled ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>
      )}
      {avg === 0 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">No ratings yet</p>
      )}
    </div>
  );
}

function OverviewCards({ data }: { data: AnalyticsOverview }) {
  const { ticketVolume } = data;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Tickets</p>
        <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
          {ticketVolume.total.toLocaleString()}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>
            <span className="font-medium text-blue-600 dark:text-blue-400">{ticketVolume.open}</span> open
          </span>
          <span>
            <span className="font-medium text-yellow-600 dark:text-yellow-400">{ticketVolume.pending}</span> pending
          </span>
          <span>
            <span className="font-medium text-green-600 dark:text-green-400">{ticketVolume.resolved}</span> resolved
          </span>
          <span>
            <span className="font-medium text-gray-600 dark:text-gray-300">{ticketVolume.closed}</span> closed
          </span>
        </div>
      </div>

      <StatCard
        label="Avg Resolution Time"
        value={data.avgResolutionTimeHours > 0 ? formatHours(data.avgResolutionTimeHours) : '—'}
        sub="for resolved/closed tickets"
      />

      <SlaCard rate={data.slaComplianceRate} />

      <CsatCard avg={data.csatAverage} />
    </div>
  );
}

function TrendChart({ data }: { data: AnalyticsTrends }) {
  if (data.labels.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Volume Trend
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
          No data for this period.
        </p>
      </div>
    );
  }

  const maxVal = Math.max(...data.created, ...data.resolved, 1);

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Volume Trend
      </h2>

      <div className="flex gap-4 mb-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
          <span className="text-gray-600 dark:text-gray-300">Created</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />
          <span className="text-gray-600 dark:text-gray-300">Resolved</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <div
          className="flex items-end gap-1 min-w-0"
          style={{ minHeight: '140px' }}
        >
          {data.labels.map((label, i) => {
            const createdH = Math.max(
              2,
              Math.round((data.created[i] / maxVal) * 120),
            );
            const resolvedH = Math.max(
              2,
              Math.round((data.resolved[i] / maxVal) * 120),
            );
            const shortLabel =
              label.length === 10 ? label.substring(5) : label;

            return (
              <div
                key={label}
                className="flex flex-col items-center gap-1 flex-1"
                style={{ minWidth: '28px' }}
                title={`${label}: ${data.created[i]} created, ${data.resolved[i]} resolved`}
              >
                <div className="flex items-end gap-0.5 w-full justify-center">
                  <div
                    className="bg-blue-500 rounded-t-sm opacity-80 w-2.5 transition-all"
                    style={{ height: `${createdH}px` }}
                  />
                  <div
                    className="bg-green-500 rounded-t-sm opacity-80 w-2.5 transition-all"
                    style={{ height: `${resolvedH}px` }}
                  />
                </div>
                <span className="text-gray-400 dark:text-gray-500 text-xs leading-none rotate-45 origin-top-left whitespace-nowrap">
                  {shortLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HorizontalBar({
  label,
  count,
  total,
  colorClass,
  textClass,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
  textClass?: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className={`text-sm font-medium ${textClass ?? 'text-gray-700 dark:text-gray-300'}`}>
          {label}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {count.toLocaleString()} ({pct}%)
        </span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClass} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ChannelBreakdown({ data }: { data: AnalyticsOverview }) {
  const channels = Object.entries(data.ticketsByChannel).sort(
    ([, a], [, b]) => b - a,
  );
  const total = channels.reduce((s, [, c]) => s + c, 0);

  const CHANNEL_COLORS = [
    'bg-purple-500',
    'bg-blue-500',
    'bg-cyan-500',
    'bg-teal-500',
    'bg-indigo-500',
  ];

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Tickets by Channel
      </h2>
      {channels.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No data for this period.</p>
      ) : (
        <div className="space-y-3">
          {channels.map(([ch, count], idx) => (
            <HorizontalBar
              key={ch}
              label={CHANNEL_LABELS[ch] ?? ch}
              count={count}
              total={total}
              colorClass={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PriorityBreakdown({ data }: { data: AnalyticsOverview }) {
  const order = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
  const entries = order
    .map((p) => [p, data.ticketsByPriority[p] ?? 0] as [string, number])
    .filter(([, c]) => c > 0);
  const total = entries.reduce((s, [, c]) => s + c, 0);

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Priority Distribution
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No data for this period.</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([p, count]) => (
            <HorizontalBar
              key={p}
              label={p.charAt(0) + p.slice(1).toLowerCase()}
              count={count}
              total={total}
              colorClass={PRIORITY_COLORS[p] ?? 'bg-gray-400'}
              textClass={PRIORITY_TEXT_COLORS[p]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentLeaderboard({ data }: { data: AnalyticsAgents }) {
  const { agents } = data;
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Agent Performance
      </h2>
      {agents.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No agent data for this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                {['Agent', 'Assigned', 'Resolved', 'Avg Resolution', 'First Response'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {agents.map((agent, idx) => (
                <tr
                  key={agent.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500 w-5">
                        {idx + 1}.
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {agent.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {agent.ticketsAssigned}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-green-600 dark:text-green-400">
                    {agent.ticketsResolved}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {agent.avgResolutionHours > 0
                      ? formatHours(agent.avgResolutionHours)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {agent.avgFirstResponseMinutes > 0
                      ? formatMinutes(agent.avgFirstResponseMinutes)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TopTags({ data }: { data: AnalyticsTags }) {
  const { tags } = data;
  const maxCount = tags[0]?.count ?? 1;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Top Tags
      </h2>
      {tags.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No tags found for this period.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map(({ tag, count }) => {
            const intensity = Math.max(0.3, count / maxCount);
            // Use inline style for dynamic sizing; class stays static for Tailwind
            return (
              <span
                key={tag}
                title={`${count} tickets`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 cursor-default"
                style={{ fontSize: `${0.7 + intensity * 0.35}rem` }}
              >
                {tag}
                <span className="text-blue-600 dark:text-blue-400 text-xs font-normal">
                  {count}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoadingPlaceholder() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 h-28">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4" />
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 h-48">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');

  const overviewQuery = useQuery({
    queryKey: ['analytics-overview', period],
    queryFn: () => getAnalyticsOverview(period),
    staleTime: 60_000,
  });

  const trendsQuery = useQuery({
    queryKey: ['analytics-trends', period],
    queryFn: () => getAnalyticsTrends(period, 'day'),
    staleTime: 60_000,
  });

  const agentsQuery = useQuery({
    queryKey: ['analytics-agents', period],
    queryFn: () => getAnalyticsAgents(period),
    staleTime: 60_000,
  });

  const tagsQuery = useQuery({
    queryKey: ['analytics-tags', period],
    queryFn: () => getAnalyticsTags(period, 20),
    staleTime: 60_000,
  });

  const isLoading =
    overviewQuery.isLoading ||
    trendsQuery.isLoading ||
    agentsQuery.isLoading ||
    tagsQuery.isLoading;

  const hasError =
    overviewQuery.isError ||
    trendsQuery.isError ||
    agentsQuery.isError ||
    tagsQuery.isError;

  return (
    <div className="p-6 max-w-7xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Support performance overview and trends
          </p>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {(['7d', '30d', '90d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {hasError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-200">
            Failed to load analytics. Please try again.
          </p>
        </div>
      )}

      {isLoading ? (
        <LoadingPlaceholder />
      ) : (
        <>
          {overviewQuery.data && <OverviewCards data={overviewQuery.data} />}

          {trendsQuery.data && (
            <TrendChart data={trendsQuery.data} />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {overviewQuery.data && (
              <>
                <ChannelBreakdown data={overviewQuery.data} />
                <PriorityBreakdown data={overviewQuery.data} />
              </>
            )}
          </div>

          {agentsQuery.data && <AgentLeaderboard data={agentsQuery.data} />}

          {tagsQuery.data && <TopTags data={tagsQuery.data} />}
        </>
      )}
    </div>
  );
}
