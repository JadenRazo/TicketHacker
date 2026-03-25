/**
 * API client for TicketHacker widget backend
 */

interface WidgetConfig {
  primaryColor: string;
  position: 'bottom-right' | 'bottom-left';
  greeting: string;
  preChatFields: Array<{
    name: string;
    type: string;
    required: boolean;
    label: string;
  }>;
  enabled: boolean;
}

interface ConversationResponse {
  token: string;
  conversationId: string;
  contactId: string;
}

interface Message {
  id: string;
  content: string;
  isAgent: boolean;
  createdAt: string;
  senderName?: string;
}

// Get base URL from script tag or default to localhost
function getBaseUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3001/api/widget';

  const script = document.querySelector<HTMLScriptElement>('script[data-tenant-id]');
  const apiUrl = script?.getAttribute('data-api-url');

  return apiUrl || 'http://localhost:3001/api/widget';
}

const baseUrl = getBaseUrl();

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function initWidget(tenantId: string): Promise<WidgetConfig> {
  return request<WidgetConfig>('/init', {
    method: 'POST',
    body: JSON.stringify({ tenantId }),
  });
}

export async function createConversation(
  tenantId: string,
  data: {
    name?: string;
    email?: string;
    metadata?: Record<string, any>;
  }
): Promise<ConversationResponse> {
  return request<ConversationResponse>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ tenantId, ...data }),
  });
}

export async function getMessages(
  conversationId: string,
  token: string
): Promise<Message[]> {
  return request<Message[]>(`/conversations/${conversationId}/messages?token=${encodeURIComponent(token)}`);
}

export async function sendMessage(
  conversationId: string,
  token: string,
  content: string
): Promise<Message> {
  return request<Message>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ token, content }),
  });
}

export async function sendTyping(
  conversationId: string,
  token: string,
  isTyping: boolean
): Promise<void> {
  await request<void>(`/conversations/${conversationId}/typing`, {
    method: 'POST',
    body: JSON.stringify({ token, isTyping }),
  });
}

export async function submitRating(
  conversationId: string,
  token: string,
  rating: number
): Promise<void> {
  await request<void>(`/conversations/${conversationId}/rate`, {
    method: 'POST',
    body: JSON.stringify({ token, rating }),
  });
}

export type { WidgetConfig, ConversationResponse, Message };
