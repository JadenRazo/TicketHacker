import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  TICKET_TOOLS,
  executeToolCall,
} from './tools/ticket-tools';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AgentResult {
  action: 'replied' | 'triaged' | 'escalated' | 'resolved' | 'needs_human';
  confidence: number;
  summary: string;
  toolCalls: Array<{ tool: string; args: any; result: any }>;
  draftReply?: string;
}

@Injectable()
export class OpenclawService {
  private readonly logger = new Logger(OpenclawService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly enabled: boolean;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {
    this.apiUrl = this.config.get<string>(
      'OPENCLAW_API_URL',
      'http://localhost:11434/v1',
    );
    this.apiKey = this.config.get<string>('OPENCLAW_API_KEY', '');
    this.defaultModel = this.config.get<string>(
      'OPENCLAW_AGENT_MODEL',
      'claude-sonnet-4-5-20250929',
    );
    this.enabled = !!this.apiUrl;

    if (!this.enabled) {
      this.logger.warn(
        'OpenClaw is not configured. Agent features will be disabled.',
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async checkConnectivity(): Promise<{
    connected: boolean;
    url: string;
    error?: string;
  }> {
    if (!this.enabled) {
      return { connected: false, url: this.apiUrl, error: 'Not configured' };
    }

    try {
      const response = await fetch(`${this.apiUrl}/models`, {
        headers: {
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
      });

      return {
        connected: response.ok,
        url: this.apiUrl,
        ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (error) {
      return {
        connected: false,
        url: this.apiUrl,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async runAgentLoop(
    systemPrompt: string,
    userMessage: string,
    tenantId: string,
    options?: { model?: string; maxIterations?: number },
  ): Promise<AgentResult> {
    if (!this.enabled) {
      return {
        action: 'needs_human',
        confidence: 0,
        summary: 'OpenClaw is not configured',
        toolCalls: [],
      };
    }

    const model = options?.model || this.defaultModel;
    const maxIterations = options?.maxIterations || 10;
    const executedToolCalls: AgentResult['toolCalls'] = [];

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.callChatCompletionWithTools(messages, model);

      if (!response) {
        return {
          action: 'needs_human',
          confidence: 0,
          summary: 'Failed to get response from OpenClaw',
          toolCalls: executedToolCalls,
        };
      }

      const assistantMessage = response.choices[0]?.message;
      if (!assistantMessage) {
        return {
          action: 'needs_human',
          confidence: 0,
          summary: 'Empty response from OpenClaw',
          toolCalls: executedToolCalls,
        };
      }

      messages.push(assistantMessage);

      if (
        !assistantMessage.tool_calls ||
        assistantMessage.tool_calls.length === 0
      ) {
        return this.parseAgentResponse(
          assistantMessage.content || '',
          executedToolCalls,
        );
      }

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: any;

        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          toolArgs = {};
        }

        this.logger.debug(`Agent calling tool: ${toolName}(${JSON.stringify(toolArgs)})`);

        const result = await executeToolCall(
          toolName,
          toolArgs,
          tenantId,
          this.prisma,
          this.eventEmitter,
        );

        executedToolCalls.push({ tool: toolName, args: toolArgs, result });

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        });
      }
    }

    return {
      action: 'needs_human',
      confidence: 0,
      summary: 'Agent reached maximum iterations without completing',
      toolCalls: executedToolCalls,
    };
  }

  async generateDraftReply(
    ticketId: string,
    tenantId: string,
    options?: { model?: string },
  ): Promise<AgentResult> {
    const systemPrompt = `You are a helpful support agent. Your task is to draft a reply to the customer's ticket.
Review the ticket details and conversation history, then compose a professional and helpful reply.

After reviewing the ticket with get_ticket, respond with a JSON object:
{
  "action": "replied",
  "confidence": <0-1 how confident you are this reply addresses the issue>,
  "summary": "<brief summary of what the reply addresses>",
  "draftReply": "<the actual draft reply text>"
}

Return ONLY the JSON, no other text.`;

    return this.runAgentLoop(
      systemPrompt,
      `Please draft a reply for ticket ${ticketId}. First use get_ticket to understand the context.`,
      tenantId,
      options,
    );
  }

  async triageTicket(
    ticketId: string,
    tenantId: string,
    options?: { model?: string },
  ): Promise<AgentResult> {
    const systemPrompt = `You are a ticket triage agent. Your job is to analyze incoming tickets and:
1. Classify the category and sentiment
2. Set the appropriate priority
3. Search for similar past tickets for context
4. Check the customer's history

Use the available tools to gather information, then take action:
- Use update_ticket to set the correct priority
- Use add_note to document your triage findings
- If the issue is urgent or critical, use escalate

After completing triage, respond with a JSON object:
{
  "action": "triaged",
  "confidence": <0-1>,
  "summary": "<what you found and what actions you took>"
}

Return ONLY the JSON, no other text.`;

    return this.runAgentLoop(
      systemPrompt,
      `Triage ticket ${ticketId}. Use get_ticket to start, then search_tickets for similar issues and get_contact_history for the customer's history.`,
      tenantId,
      options,
    );
  }

  async attemptResolve(
    ticketId: string,
    tenantId: string,
    options?: { model?: string },
  ): Promise<AgentResult> {
    const systemPrompt = `You are an AI support agent attempting to resolve a customer's issue.
Review the ticket, check the customer's history, and search for similar resolved tickets.

If you can confidently resolve the issue:
- Use send_reply to respond to the customer
- Use update_ticket to set status to RESOLVED
- Respond with action "resolved"

If you cannot resolve it:
- Use add_note with your analysis
- Use escalate to hand off to a human
- Respond with action "escalated" or "needs_human"

After completing, respond with a JSON object:
{
  "action": "resolved" | "escalated" | "needs_human",
  "confidence": <0-1>,
  "summary": "<what you found and did>"
}

Return ONLY the JSON, no other text.`;

    return this.runAgentLoop(
      systemPrompt,
      `Attempt to resolve ticket ${ticketId}. Start by gathering context with get_ticket, search_tickets, and get_contact_history.`,
      tenantId,
      options,
    );
  }

  async summarizeTicket(
    ticketId: string,
    tenantId: string,
    options?: { model?: string },
  ): Promise<AgentResult> {
    const systemPrompt = `You are a support analyst. Summarize the given ticket with actionable insights.
Use get_ticket to review the full conversation, then provide a summary.

Respond with a JSON object:
{
  "action": "triaged",
  "confidence": 1,
  "summary": "<detailed summary including: issue description, steps taken, current status, customer sentiment, and recommended next actions>"
}

Return ONLY the JSON, no other text.`;

    return this.runAgentLoop(
      systemPrompt,
      `Summarize ticket ${ticketId} with action items.`,
      tenantId,
      options,
    );
  }

  async handleWidgetMessage(
    ticketId: string,
    tenantId: string,
    customerMessage: string,
    options?: { model?: string; confidenceThreshold?: number },
  ): Promise<AgentResult> {
    const threshold = options?.confidenceThreshold || 0.8;

    const systemPrompt = `You are a friendly support chatbot helping a customer in real-time via a chat widget.
Your goal is to answer their question helpfully. Use get_ticket for context and search_tickets for similar resolved issues.

If you can answer confidently (confidence >= ${threshold}):
- Use send_reply to respond directly
- Respond with action "replied"

If you're not confident or the issue is complex:
- Respond with action "needs_human"
- Include a draftReply that says you're connecting them with a human agent

Respond with a JSON object:
{
  "action": "replied" | "needs_human",
  "confidence": <0-1>,
  "summary": "<brief description>",
  "draftReply": "<the reply you sent or would send>"
}

Return ONLY the JSON, no other text.`;

    return this.runAgentLoop(
      systemPrompt,
      `Customer message on ticket ${ticketId}: "${customerMessage}". Use get_ticket for full context.`,
      tenantId,
      options,
    );
  }

  private async callChatCompletionWithTools(
    messages: ChatMessage[],
    model: string,
  ): Promise<any> {
    try {
      const response = await fetch(`${this.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify({
          model,
          messages,
          tools: TICKET_TOOLS,
          tool_choice: 'auto',
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        this.logger.error(
          `OpenClaw API error: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Failed to call OpenClaw with tools', error);
      return null;
    }
  }

  private parseAgentResponse(
    content: string,
    toolCalls: AgentResult['toolCalls'],
  ): AgentResult {
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        action: parsed.action || 'needs_human',
        confidence: parsed.confidence || 0,
        summary: parsed.summary || content,
        toolCalls,
        draftReply: parsed.draftReply,
      };
    } catch {
      return {
        action: 'needs_human',
        confidence: 0,
        summary: content || 'Unable to parse agent response',
        toolCalls,
      };
    }
  }
}
