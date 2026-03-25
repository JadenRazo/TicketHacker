import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ChatMessage {
  role: string;
  content: string;
}

interface ClassificationResult {
  category: string;
  suggestedPriority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  suggestedTeam: string | null;
  autoApply: boolean;
}

interface ReplySuggestion {
  tone: string;
  content: string;
}

interface ThreadSummary {
  issue: string;
  stepsTaken: string[];
  currentStatus: string;
  sentiment: string;
  actionItems: string[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly enabled: boolean;

  constructor(private config: ConfigService) {
    this.apiUrl = this.config.get<string>('OPENCLAW_API_URL', 'http://localhost:11434/v1');
    this.apiKey = this.config.get<string>('OPENCLAW_API_KEY', '');
    this.enabled = !!this.apiUrl;

    if (!this.enabled) {
      this.logger.warn('OpenClaw AI is not configured. AI features will be disabled.');
    }
  }

  async classifyTicket(ticket: {
    subject: string;
    firstMessage: string;
  }): Promise<ClassificationResult | null> {
    if (!this.enabled) return null;

    try {
      const systemPrompt = `You are a support ticket classifier. Analyze the ticket and return JSON with:
- category (string): The main category of the issue
- suggestedPriority (LOW/NORMAL/HIGH/URGENT): The priority level
- sentiment (positive/neutral/negative): Customer sentiment
- confidence (0-1): Your confidence in this classification
- suggestedTeam (string or null): Which team should handle this

Return only valid JSON, no other text.`;

      const userPrompt = `Subject: ${ticket.subject}\n\nMessage: ${ticket.firstMessage}`;

      const response = await this.callChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      if (!response) return null;

      const classification = JSON.parse(response);
      classification.autoApply = classification.confidence > 0.85;

      return classification;
    } catch (error) {
      this.logger.error('Failed to classify ticket', error);
      return null;
    }
  }

  async suggestReplies(
    messages: Array<{ role: string; content: string }>,
    tenantContext?: string,
  ): Promise<ReplySuggestion[]> {
    if (!this.enabled) return [];

    try {
      const systemPrompt = `Generate 2-3 professional support reply suggestions. Return JSON array of objects with:
- tone (string): The tone of the reply (e.g., "Professional", "Friendly", "Empathetic")
- content (string): The actual reply text

${tenantContext ? `Brand voice context: ${tenantContext}` : ''}

Return only valid JSON array, no other text.`;

      const conversationHistory = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n\n');

      const response = await this.callChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationHistory },
      ]);

      if (!response) return [];

      return JSON.parse(response);
    } catch (error) {
      this.logger.error('Failed to suggest replies', error);
      return [];
    }
  }

  async summarizeThread(
    messages: Array<{ role: string; content: string }>,
  ): Promise<ThreadSummary | null> {
    if (!this.enabled) return null;

    try {
      const systemPrompt = `Summarize this support thread. Return JSON with:
- issue (string): What is the customer's main issue?
- stepsTaken (string[]): What steps have been taken to resolve it?
- currentStatus (string): What is the current status?
- sentiment (string): Overall customer sentiment
- actionItems (string[]): What still needs to be done?

Return only valid JSON, no other text.`;

      const conversationHistory = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n\n');

      const response = await this.callChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationHistory },
      ]);

      if (!response) return null;

      return JSON.parse(response);
    } catch (error) {
      this.logger.error('Failed to summarize thread', error);
      return null;
    }
  }

  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.enabled) return null;

    try {
      return await this.callEmbeddings(text);
    } catch (error) {
      this.logger.error('Failed to generate embedding', error);
      return null;
    }
  }

  private async callChatCompletion(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number },
  ): Promise<string | null> {
    try {
      const response = await fetch(`${this.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify({
          model: options?.model || 'gpt-3.5-turbo',
          messages,
          temperature: options?.temperature || 0.7,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        this.logger.error(
          `OpenClaw API error: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || null;
    } catch (error) {
      this.logger.error('Failed to call OpenClaw chat completion', error);
      return null;
    }
  }

  private async callEmbeddings(input: string): Promise<number[] | null> {
    try {
      const response = await fetch(`${this.apiUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input,
        }),
      });

      if (!response.ok) {
        this.logger.error(
          `OpenClaw API error: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const data = await response.json();
      return data.data[0]?.embedding || null;
    } catch (error) {
      this.logger.error('Failed to call OpenClaw embeddings', error);
      return null;
    }
  }
}
