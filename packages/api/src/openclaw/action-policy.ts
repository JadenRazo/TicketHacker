export type OperationKind = 'draft' | 'summary' | 'triage' | 'resolve' | 'auto-reply';
export type OperationSource = 'manual' | 'automation' | 'callback';
const READ_TOOLS = ['get_ticket', 'search_tickets', 'get_contact_history',
  'get_canned_responses', 'search_knowledge_base', 'get_teams'] as const;
export const MUTATION_TOOLS = ['update_ticket', 'send_reply', 'add_note', 'escalate', 'set_tags', 'assign_to_team'];
export const ALLOWED_TOOLS: Record<OperationKind, readonly string[]> = {
  draft: READ_TOOLS,
  summary: READ_TOOLS,
  triage: [...READ_TOOLS, 'update_ticket', 'add_note', 'escalate', 'set_tags', 'assign_to_team'],
  resolve: [...READ_TOOLS, ...MUTATION_TOOLS],
  'auto-reply': [...READ_TOOLS, 'send_reply', 'escalate'],
};

export interface PendingTool { name: string; args: Record<string, any>; callId: string }
export interface OperationScope {
  id: string;
  tenantId: string;
  ticketId: string;
  kind: OperationKind;
  source: OperationSource;
  originMessageId: string | null;
  claimToken: string;
  pending: PendingTool[];
}

export function automationAllowed(kind: OperationKind, source: OperationSource, settings: Record<string, any>, channel: string): boolean {
  if (settings.openclawEnabled !== true) return false;
  if (source === 'manual') return true;
  const mode = settings.openclawAgentMode || 'copilot';
  if (mode === 'off') return false;
  if (source === 'callback') return true;
  if (kind === 'triage') return settings.openclawAutoTriage === true;
  if (kind === 'draft') return settings.openclawAutoSuggest !== false && ['copilot', 'autonomous'].includes(mode);
  if (channel === 'CHAT_WIDGET' && settings.openclawWidgetAgent === true) {
    return kind === (settings.openclawWidgetResolve ? 'resolve' : 'auto-reply');
  }
  return kind === 'auto-reply' && mode === 'autonomous' && withinBusinessHours(settings);
}

// JSON schema sent to the provider is also enforced at the execution boundary.
export function argumentError(tool: any, args: unknown): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return 'Arguments must be an object';
  const values = args as Record<string, unknown>;
  const { properties, required } = tool.function.parameters;
  if (Object.keys(values).some(k => !Object.hasOwn(properties, k))) return 'Unknown argument';
  if (required.some((k: string) => !Object.hasOwn(values, k))) return 'Missing required argument';
  for (const [key, value] of Object.entries(values)) {
    const rule = properties[key];
    if (rule.type === 'string' && (typeof value !== 'string' || !value.trim() || value.length > (key === 'content' ? 16000 : key === 'reason' ? 4000 : 500))) return `Invalid ${key}`;
    if (rule.enum && !rule.enum.includes(value)) return `Invalid ${key}`;
    if (rule.type === 'number' && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20)) return `Invalid ${key}`;
    if (rule.type === 'array' && (!Array.isArray(value) || value.length > 20 || value.some(v => typeof v !== 'string' || !v.trim() || v.length > 100))) return `Invalid ${key}`;
  }
  if (tool.function.name === 'update_ticket' && Object.keys(values).length < 2) return 'No update supplied';
  return null;
}

export function withinBusinessHours(settings: Record<string, any>): boolean {
    const bh = settings.businessHours ?? {};
    const timezone: string = bh.timezone ?? 'UTC';
    const startTime: string = bh.startTime ?? '09:00';
    const endTime: string = bh.endTime ?? '17:00';
    const workDays: string[] = Array.isArray(bh.workDays)
      ? bh.workDays
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    // Resolve current local date/time parts in the configured timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date());
    const dayPart = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '0';
    const minutePart = parts.find((p) => p.type === 'minute')?.value ?? '0';

    // Normalise the day abbreviation to match workDays format (e.g. "Mon")
    // en-US short weekday already returns "Mon", "Tue", etc.
    if (!workDays.includes(dayPart)) {
      return false;
    }

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const currentMinutes =
      parseInt(hourPart, 10) * 60 + parseInt(minutePart, 10);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
