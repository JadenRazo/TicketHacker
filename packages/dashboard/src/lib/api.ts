const API_URL = import.meta.env.VITE_API_URL || '/api';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    tenantId: string;
    email: string;
    role: string;
  };
}

export interface Ticket {
  id: string;
  tenantId: string;
  subject: string;
  status: string;
  priority: string;
  channel: string;
  assigneeId?: string | null;
  teamId?: string | null;
  contactId: string;
  metadata?: Record<string, any> | null;
  tags?: string[];
  snoozedUntil?: string | null;
  mergedIntoId?: string | null;
  slaDeadline?: string | null;
  customFields?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
  assignee?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  } | null;
  contact?: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    metadata?: Record<string, any> | null;
  };
  team?: {
    id: string;
    name: string;
    description?: string | null;
  } | null;
  messages?: Message[];
  _count?: {
    messages: number;
  };
}

export interface Message {
  id: string;
  tenantId: string;
  ticketId: string;
  senderId?: string | null;
  contactId?: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  contentText?: string | null;
  contentHtml?: string | null;
  messageType: 'TEXT' | 'NOTE' | 'SYSTEM' | 'AI_SUGGESTION';
  externalId?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
  sender?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  } | null;
  contact?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string | null;
  isActive: boolean;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  externalId?: string | null;
  name: string;
  email: string;
  avatarUrl?: string | null;
  channel: string;
  satisfactionRating?: number | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    tickets: number;
  };
}

export interface CannedResponse {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  shortcut?: string | null;
  scope: string;
  ownerId?: string | null;
  teamId?: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedView {
  id: string;
  name: string;
  filters: Record<string, any>;
}

export interface Macro {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  actions: Array<{ type: string; value: any }>;
  scope: string;
  ownerId?: string | null;
  teamId?: string | null;
  usageCount: number;
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

const SORT_MAP: Record<string, string> = {
  newest: 'createdAt:desc',
  oldest: 'createdAt:asc',
  priority: 'priority:desc',
  sla: 'slaDeadline:asc',
};

let isRefreshing = false;
let refreshQueue: Array<() => void> = [];

async function refreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    return false;
  }

  if (isRefreshing) {
    return new Promise((resolve) => {
      refreshQueue.push(() => resolve(true));
    });
  }

  isRefreshing = true;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      return false;
    }

    const data = await response.json();
    localStorage.setItem('accessToken', data.accessToken);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }

    refreshQueue.forEach((callback) => callback());
    refreshQueue = [];
    return true;
  } catch (error) {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    return false;
  } finally {
    isRefreshing = false;
  }
}

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && retry) {
    const refreshed = await refreshToken();
    if (refreshed) {
      return fetchAPI<T>(endpoint, options, false);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetchAPI<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);

  localStorage.setItem('accessToken', response.accessToken);
  localStorage.setItem('refreshToken', response.refreshToken);

  return response;
}

export async function getTickets(params?: {
  status?: string[];
  priority?: string[];
  channel?: string[];
  assigneeId?: string;
  search?: string;
  sortBy?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ tickets: Ticket[]; nextCursor?: string | null }> {
  const query = new URLSearchParams();

  if (params) {
    if (params.status) query.append('status', params.status.join(','));
    if (params.priority) query.append('priority', params.priority.join(','));
    if (params.channel) query.append('channel', params.channel.join(','));
    if (params.assigneeId) query.append('assigneeId', params.assigneeId);
    if (params.search) query.append('search', params.search);
    if (params.sortBy) {
      const mapped = SORT_MAP[params.sortBy];
      if (mapped) {
        const [sortBy, sortOrder] = mapped.split(':');
        query.append('sortBy', sortBy);
        query.append('sortOrder', sortOrder);
      } else {
        query.append('sortBy', params.sortBy);
      }
    }
    if (params.cursor) query.append('cursor', params.cursor);
    if (params.limit) query.append('limit', params.limit.toString());
  }

  const result = await fetchAPI<{ data: Ticket[]; nextCursor: string | null }>(
    `/tickets?${query.toString()}`
  );

  return {
    tickets: result.data,
    nextCursor: result.nextCursor ?? undefined
  };
}

export async function getTicket(id: string): Promise<Ticket> {
  return fetchAPI<Ticket>(`/tickets/${id}`);
}

export async function updateTicket(
  id: string,
  data: Partial<Omit<Ticket, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'assignee' | 'contact' | 'team' | 'messages' | '_count'>>
): Promise<Ticket> {
  return fetchAPI<Ticket>(`/tickets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function snoozeTicket(id: string, until: string): Promise<Ticket> {
  return fetchAPI<Ticket>(`/tickets/${id}/snooze`, {
    method: 'POST',
    body: JSON.stringify({ until }),
  });
}

export async function mergeTickets(ticketId: string, targetTicketId: string): Promise<Ticket> {
  return fetchAPI<Ticket>(`/tickets/${ticketId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ targetTicketId }),
  });
}

export async function getMessages(ticketId: string, params?: {
  cursor?: string;
  limit?: number;
}): Promise<{ messages: Message[]; nextCursor?: string | null }> {
  const query = new URLSearchParams();
  if (params?.cursor) query.append('cursor', params.cursor);
  if (params?.limit) query.append('limit', params.limit.toString());

  const result = await fetchAPI<{ data: Message[]; nextCursor: string | null }>(
    `/tickets/${ticketId}/messages?${query.toString()}`
  );

  return {
    messages: result.data,
    nextCursor: result.nextCursor ?? undefined
  };
}

export async function createMessage(
  ticketId: string,
  data: {
    contentText?: string;
    contentHtml?: string;
    messageType: 'TEXT' | 'NOTE' | 'SYSTEM' | 'AI_SUGGESTION';
  }
): Promise<Message> {
  return fetchAPI<Message>(`/tickets/${ticketId}/messages`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function bulkUpdateTickets(
  ticketIds: string[],
  updates: {
    status?: string;
    priority?: string;
    assigneeId?: string | null;
    tags?: string[];
  }
): Promise<{ updated: number }> {
  return fetchAPI<{ updated: number }>('/tickets/bulk', {
    method: 'POST',
    body: JSON.stringify({ ticketIds, updates }),
  });
}

export async function getUsers(params?: {
  search?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ users: User[]; nextCursor?: string | null }> {
  const query = new URLSearchParams();
  if (params?.search) query.append('search', params.search);
  if (params?.cursor) query.append('cursor', params.cursor);
  if (params?.limit) query.append('limit', params.limit.toString());

  const result = await fetchAPI<{ data: User[]; nextCursor: string | null }>(
    `/users?${query.toString()}`
  );

  return {
    users: result.data,
    nextCursor: result.nextCursor ?? undefined
  };
}

export async function getContacts(params?: {
  search?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ contacts: Contact[]; nextCursor?: string | null }> {
  const query = new URLSearchParams();
  if (params?.search) query.append('search', params.search);
  if (params?.cursor) query.append('cursor', params.cursor);
  if (params?.limit) query.append('limit', params.limit.toString());

  const result = await fetchAPI<{ data: Contact[]; nextCursor: string | null }>(
    `/contacts?${query.toString()}`
  );

  return {
    contacts: result.data,
    nextCursor: result.nextCursor ?? undefined
  };
}

export async function getCannedResponses(): Promise<CannedResponse[]> {
  return fetchAPI<CannedResponse[]>('/canned-responses');
}

export async function getSavedViews(): Promise<SavedView[]> {
  return fetchAPI<SavedView[]>('/saved-views');
}

export async function getMacros(): Promise<Macro[]> {
  return fetchAPI<Macro[]>('/macros');
}

export async function executeMacro(macroId: string, ticketId: string): Promise<Ticket> {
  return fetchAPI<Ticket>(`/macros/${macroId}/execute`, {
    method: 'POST',
    body: JSON.stringify({ ticketId }),
  });
}

export async function getTenant(): Promise<Tenant> {
  return fetchAPI<Tenant>('/tenant');
}

export async function updateTenant(
  data: Partial<Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Tenant> {
  return fetchAPI<Tenant>('/tenant', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export interface OpenClawStatus {
  connected: boolean;
  url: string;
  error?: string;
  tenantConfig: {
    openclawEnabled: boolean;
    openclawAgentMode: string;
    openclawWidgetAgent: boolean;
    openclawAutoTriage: boolean;
  };
}

export interface AgentResult {
  action: 'replied' | 'triaged' | 'escalated' | 'resolved' | 'needs_human';
  confidence: number;
  summary: string;
  toolCalls: Array<{ tool: string; args: any; result: any }>;
  draftReply?: string;
}

export async function getOpenClawStatus(): Promise<OpenClawStatus> {
  return fetchAPI<OpenClawStatus>('/openclaw/status');
}

export async function aiTriageTicket(
  ticketId: string,
  model?: string,
): Promise<{ result: AgentResult }> {
  return fetchAPI<{ result: AgentResult }>(`/openclaw/agent/triage/${ticketId}`, {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
}

export async function aiDraftReply(
  ticketId: string,
  model?: string,
): Promise<{ result: AgentResult }> {
  return fetchAPI<{ result: AgentResult }>(`/openclaw/agent/reply/${ticketId}`, {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
}

export async function aiResolveTicket(
  ticketId: string,
  model?: string,
): Promise<{ result: AgentResult }> {
  return fetchAPI<{ result: AgentResult }>(`/openclaw/agent/resolve/${ticketId}`, {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
}

export async function aiSummarizeTicket(
  ticketId: string,
  model?: string,
): Promise<{ result: AgentResult }> {
  return fetchAPI<{ result: AgentResult }>(`/openclaw/agent/summarize/${ticketId}`, {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
}
