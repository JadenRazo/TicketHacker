import { randomUUID } from 'crypto';
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
  sentiment?: string;
  suggestedTags?: string[];
}

interface AiActivityEntry {
  action: string;
  result: { action: string; confidence: number; summary: string };
  triggeredBy: 'manual' | 'auto-triage' | 'auto-reply' | 'copilot';
  toolCallCount: number;
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

  async buildTenantContext(tenantId: string): Promise<string> {
    const parts: string[] = [];

    // Fetch tenant name and settings
    let tenant: { name: string; settings: any } | null = null;
    try {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, settings: true },
      });
    } catch (error) {
      this.logger.warn(`buildTenantContext: failed to fetch tenant ${tenantId}`, error);
    }

    const settings = (tenant?.settings as Record<string, any>) ?? {};
    const bh = settings.businessHours ?? {};

    parts.push('## Company Context');
    parts.push(`Company: ${tenant?.name ?? 'Unknown'}`);
    parts.push(
      `Business Hours: ${bh.startTime ?? '09:00'}-${bh.endTime ?? '17:00'} (${bh.timezone ?? 'UTC'}), ${Array.isArray(bh.workDays) ? bh.workDays.join(', ') : 'Mon, Tue, Wed, Thu, Fri'}`,
    );
    parts.push(`Tone: ${settings.tonePreference ?? 'professional and helpful'}`);
    parts.push(`SLA First Response Target: ${settings.slaFirstResponse ?? 'not set'} minutes`);
    parts.push(`SLA Resolution Target: ${settings.slaResolution ?? 'not set'} minutes`);

    // Fetch available teams
    let teams: Array<{ name: string; description: string | null }> = [];
    try {
      teams = await this.prisma.team.findMany({
        where: { tenantId },
        select: { name: true, description: true },
      });
    } catch (error) {
      this.logger.warn(`buildTenantContext: failed to fetch teams for tenant ${tenantId}`, error);
    }

    parts.push('');
    parts.push('## Available Teams');
    if (teams.length > 0) {
      parts.push(
        teams.map((t) => `- ${t.name}: ${t.description ?? 'No description'}`).join('\n'),
      );
    } else {
      parts.push('- No teams configured');
    }

    // Fetch custom field definitions
    let fields: Array<{ name: string; fieldType: string; isRequired: boolean; options: any }> = [];
    try {
      fields = await this.prisma.customFieldDefinition.findMany({
        where: { tenantId },
        select: { name: true, fieldType: true, isRequired: true, options: true },
      });
    } catch (error) {
      this.logger.warn(`buildTenantContext: failed to fetch custom fields for tenant ${tenantId}`, error);
    }

    parts.push('');
    parts.push('## Custom Fields');
    if (fields.length > 0) {
      parts.push(
        fields
          .map(
            (f) =>
              `- ${f.name} (${f.fieldType})${f.isRequired ? ' [required]' : ''}${f.options ? `: ${JSON.stringify(f.options)}` : ''}`,
          )
          .join('\n'),
      );
    } else {
      parts.push('- No custom fields defined');
    }

    return parts.join('\n');
  }

  static isWithinBusinessHours(settings: Record<string, any>): boolean {
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

    const currentMinutes = parseInt(hourPart, 10) * 60 + parseInt(minutePart, 10);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  async appendAiActivity(
    ticketId: string,
    tenantId: string,
    entry: AiActivityEntry,
  ): Promise<void> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      select: { id: true, metadata: true },
    });

    if (!ticket) {
      this.logger.warn(`appendAiActivity: ticket ${ticketId} not found for tenant ${tenantId}`);
      return;
    }

    const meta = (ticket.metadata as Record<string, any>) ?? {};
    const log: any[] = Array.isArray(meta.aiActivityLog) ? meta.aiActivityLog : [];

    log.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    });

    // Keep only the most recent 50 entries
    if (log.length > 50) {
      log.splice(0, log.length - 50);
    }

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        metadata: {
          ...meta,
          aiActivityLog: log,
        },
      },
    });
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
    const tenantContext = await this.buildTenantContext(tenantId);

    const systemPrompt = `${tenantContext}

## Your Role
You are a support agent drafting a reply to a customer ticket. Your responses should match the company's tone preference.

## Strategy
1. Use get_ticket to understand the full conversation
2. Use get_canned_responses to find relevant pre-written responses
3. Use search_knowledge_base to find how similar issues were resolved
4. Use get_contact_history to understand the customer's history
5. Draft a reply that addresses the issue comprehensively

## Guidelines
- If a canned response fits well, adapt it to the specific situation
- Reference previous successful resolutions when relevant
- Be empathetic and acknowledge the customer's frustration if present
- Include specific next steps or actionable information
- Keep replies concise but thorough

## Output
Return ONLY a JSON object:
{
  "action": "replied",
  "confidence": <0.0-1.0>,
  "summary": "<what the reply addresses and approach taken>",
  "draftReply": "<the actual reply text>",
  "sentiment": "<positive|neutral|negative|frustrated|angry>"
}`;

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
    const tenantContext = await this.buildTenantContext(tenantId);

    const systemPrompt = `${tenantContext}

## Your Role
You are a ticket triage specialist. Analyze incoming tickets to classify, prioritize, and route them.

## Strategy
1. Use get_ticket to read the full ticket and messages
2. Analyze customer sentiment from message tone and word choice
3. Use search_tickets to find similar past issues
4. Use get_contact_history to check if this is a repeat issue
5. Use get_teams to see available teams for routing
6. Take action based on your analysis

## Actions to Take
- Use update_ticket to set the correct priority based on:
  * Urgency keywords ("ASAP", "down", "broken", "urgent", "critical", "emergency") = HIGH or URGENT
  * Repeat issues from same contact = bump priority up one level
  * SLA deadline proximity = consider bumping priority
  * Business impact language = HIGH or URGENT
- Use set_tags to classify the ticket (e.g. "billing", "technical", "feature-request", "bug")
- Use assign_to_team if a specific team should handle this
- Use add_note to document your triage analysis
- Use escalate if the issue is critical and needs immediate human attention

## Output
Return ONLY a JSON object:
{
  "action": "triaged",
  "confidence": <0.0-1.0>,
  "summary": "<what you found, actions taken, and reasoning>",
  "sentiment": "<positive|neutral|negative|frustrated|angry>",
  "suggestedTags": ["tag1", "tag2"]
}`;

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
    const tenantContext = await this.buildTenantContext(tenantId);

    const systemPrompt = `${tenantContext}

## Your Role
You are an AI support agent attempting to fully resolve a customer's issue.

## Strategy
1. Use get_ticket to understand the issue completely
2. Use search_knowledge_base extensively to find solutions from past resolved tickets
3. Use get_canned_responses for standard resolution templates
4. Use search_tickets with status RESOLVED for similar past solutions
5. Use get_contact_history to understand context and avoid repeating failed solutions

## Resolution Rules
- Only resolve if you have HIGH confidence (>= 0.8) that your solution addresses the issue
- Use send_reply to respond to the customer with the solution
- Use update_ticket to set status to RESOLVED
- If you cannot confidently resolve, use escalate with a detailed reason

## Output
Return ONLY a JSON object:
{
  "action": "resolved" | "escalated" | "needs_human",
  "confidence": <0.0-1.0>,
  "summary": "<what you found, what you did, and why>",
  "sentiment": "<positive|neutral|negative|frustrated|angry>"
}`;

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
    const tenantContext = await this.buildTenantContext(tenantId);

    const systemPrompt = `${tenantContext}

## Your Role
You are a support analyst creating a detailed ticket summary with actionable insights.

## Strategy
1. Use get_ticket to review the full conversation
2. Use get_contact_history to understand the customer relationship
3. Use search_tickets to find related issues

## Output
Return ONLY a JSON object:
{
  "action": "triaged",
  "confidence": 1,
  "summary": "<Structured summary including: ISSUE: what the problem is | HISTORY: steps taken so far | STATUS: current state | SENTIMENT: customer mood | RECOMMENDED ACTIONS: 1. first action 2. second action>",
  "sentiment": "<positive|neutral|negative|frustrated|angry>"
}`;

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
    const tenantContext = await this.buildTenantContext(tenantId);

    const systemPrompt = `${tenantContext}

## Your Role
You are a friendly support chatbot helping a customer in real-time via chat. Be conversational and helpful.

## Strategy
1. Use get_ticket for conversation context
2. Use get_canned_responses for quick answers
3. Use search_knowledge_base for solutions
4. Use search_tickets for similar resolved issues

## Rules
- If confident (>= ${threshold}): use send_reply to respond directly
- If not confident: respond with action "needs_human" and a polite message about connecting them with a human
- Keep responses conversational and concise
- Match the company tone preference

## Output
Return ONLY a JSON object:
{
  "action": "replied" | "needs_human",
  "confidence": <0.0-1.0>,
  "summary": "<brief description>",
  "draftReply": "<the reply text>",
  "sentiment": "<positive|neutral|negative|frustrated|angry>"
}`;

    return this.runAgentLoop(
      systemPrompt,
      `Customer message on ticket ${ticketId}: "${customerMessage}". Use get_ticket for full context.`,
      tenantId,
      options,
    );
  }

  async processWebhookEvent(
    event: import('./dto/agent-action.dto').WebhookEventType,
    ticketId: string,
    tenantId: string,
    payload?: Record<string, any>,
  ): Promise<void> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      select: { id: true, status: true },
    });

    if (!ticket) {
      this.logger.warn(
        `Webhook event '${event}' references unknown ticket ${ticketId} for tenant ${tenantId}`,
      );
      return;
    }

    switch (event) {
      case 'agent.completed': {
        const result = payload?.result as Partial<AgentResult> | undefined;

        if (!result) {
          this.logger.warn(`agent.completed for ticket ${ticketId} had no result payload`);
          return;
        }

        const updateData: Record<string, any> = {
          metadata: {
            aiCompletion: {
              action: result.action,
              confidence: result.confidence,
              summary: result.summary,
              completedAt: new Date().toISOString(),
            },
          },
        };

        if (result.action === 'resolved') {
          updateData.status = 'RESOLVED';
          updateData.resolvedAt = new Date();
        } else if (result.action === 'escalated' || result.action === 'needs_human') {
          updateData.status = 'OPEN';
        }

        if (payload?.priority) {
          updateData.priority = payload.priority;
        }

        if (Array.isArray(payload?.tags) && payload.tags.length > 0) {
          updateData.tags = payload.tags;
        }

        const updated = await this.prisma.ticket.update({
          where: { id: ticketId },
          data: updateData,
        });

        this.eventEmitter.emit('ticket.updated', { tenantId, ticket: updated });

        if (result.summary) {
          const note = await this.prisma.message.create({
            data: {
              tenantId,
              ticketId,
              direction: 'OUTBOUND',
              contentText: `[Agent] ${result.summary}`,
              messageType: 'SYSTEM',
            },
          });

          this.eventEmitter.emit('message.created', { tenantId, ticketId, message: note });
        }

        this.logger.log(
          `agent.completed for ticket ${ticketId}: action=${result.action}, confidence=${result.confidence}`,
        );
        break;
      }

      case 'agent.failed': {
        const errorMessage = payload?.error ?? 'Agent encountered an unknown error';
        const errorCode = payload?.code ?? 'UNKNOWN';

        this.logger.error(
          `agent.failed for ticket ${ticketId} (tenant ${tenantId}): [${errorCode}] ${errorMessage}`,
        );

        const systemMsg = await this.prisma.message.create({
          data: {
            tenantId,
            ticketId,
            direction: 'OUTBOUND',
            contentText: `[Agent] Automated processing failed: ${errorMessage}. A human agent should review this ticket.`,
            messageType: 'SYSTEM',
          },
        });

        this.eventEmitter.emit('message.created', { tenantId, ticketId, message: systemMsg });
        break;
      }

      case 'agent.reply_sent': {
        const content = payload?.content as string | undefined;

        if (!content) {
          this.logger.warn(`agent.reply_sent for ticket ${ticketId} had no content`);
          return;
        }

        const reply = await this.prisma.message.create({
          data: {
            tenantId,
            ticketId,
            direction: 'OUTBOUND',
            contentText: content,
            messageType: 'TEXT',
            metadata: {
              aiGenerated: true,
              sentViaWebhook: true,
            },
          },
        });

        this.eventEmitter.emit('message.created', { tenantId, ticketId, message: reply });

        this.logger.log(`agent.reply_sent recorded for ticket ${ticketId}`);
        break;
      }

      case 'agent.escalated': {
        const reason = payload?.reason ?? 'Escalated by agent';

        const escalatedTicket = await this.prisma.ticket.update({
          where: { id: ticketId },
          data: {
            status: 'OPEN',
            assigneeId: null,
            metadata: {
              escalation: {
                reason,
                escalatedAt: new Date().toISOString(),
                escalatedBy: 'webhook',
              },
            },
          },
        });

        this.eventEmitter.emit('ticket.updated', { tenantId, ticket: escalatedTicket });

        const escalationNote = await this.prisma.message.create({
          data: {
            tenantId,
            ticketId,
            direction: 'OUTBOUND',
            contentText: `[Agent] Escalated to human agent. Reason: ${reason}`,
            messageType: 'SYSTEM',
          },
        });

        this.eventEmitter.emit('message.created', { tenantId, ticketId, message: escalationNote });

        this.logger.log(`agent.escalated for ticket ${ticketId}: ${reason}`);
        break;
      }

      default: {
        this.logger.warn(`Unhandled webhook event type: ${event}`);
      }
    }
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
        sentiment: parsed.sentiment,
        suggestedTags: parsed.suggestedTags,
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
