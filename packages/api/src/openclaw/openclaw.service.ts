import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { TICKET_TOOLS, executeToolCall, applyPendingTools } from './tools/ticket-tools';

import { AgentOperations, stopped } from './agent-operations';
import { ALLOWED_TOOLS, withinBusinessHours } from './action-policy';
import type { OperationKind, OperationScope, OperationSource } from './action-policy';
import { CONTEXT_RULES, loadThreadContext } from '../ai/thread-context';

export interface AgentOptions {
  model?: string;
  requestId?: string;
  operation?: { id: string; originMessageId: string | null; source: OperationSource };
}

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
  action: 'drafted' | 'summarized' | 'triaged' | 'escalated' | 'needs_human' | 'superseded' | 'uncertain';
  confidence: number;
  summary: string;
  toolCalls: Array<{ tool: string; args: any; result: any }>;
  draftReply?: string;
  sentiment?: string;
  suggestedTags?: string[];
  operationId?: string;
  delivery?: 'not_sent';
  notification?: 'best_effort';
}

interface AiActivityEntry {
  operationId?: string;
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
    private operations: AgentOperations,
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
      this.logger.warn(
        `buildTenantContext: failed to fetch tenant ${tenantId}`,
        error,
      );
    }

    const settings = (tenant?.settings as Record<string, any>) ?? {};
    const bh = settings.businessHours ?? {};

    parts.push('## Company Context');
    parts.push(`Company: ${tenant?.name ?? 'Unknown'}`);
    parts.push(
      `Business Hours: ${bh.startTime ?? '09:00'}-${bh.endTime ?? '17:00'} (${bh.timezone ?? 'UTC'}), ${Array.isArray(bh.workDays) ? bh.workDays.join(', ') : 'Mon, Tue, Wed, Thu, Fri'}`,
    );
    parts.push(
      `Tone: ${settings.tonePreference ?? 'professional and helpful'}`,
    );
    parts.push(
      `SLA First Response Target: ${settings.slaFirstResponse ?? 'not set'} minutes`,
    );
    parts.push(
      `SLA Resolution Target: ${settings.slaResolution ?? 'not set'} minutes`,
    );

    // Fetch available teams
    let teams: Array<{ name: string; description: string | null }> = [];
    try {
      teams = await this.prisma.team.findMany({
        where: { tenantId },
        select: { name: true, description: true },
      });
    } catch (error) {
      this.logger.warn(
        `buildTenantContext: failed to fetch teams for tenant ${tenantId}`,
        error,
      );
    }

    parts.push('');
    parts.push('## Available Teams');
    if (teams.length > 0) {
      parts.push(
        teams
          .map((t) => `- ${t.name}: ${t.description ?? 'No description'}`)
          .join('\n'),
      );
    } else {
      parts.push('- No teams configured');
    }

    // Fetch custom field definitions
    let fields: Array<{
      name: string;
      fieldType: string;
      isRequired: boolean;
      options: any;
    }> = [];
    try {
      fields = await this.prisma.customFieldDefinition.findMany({
        where: { tenantId },
        select: {
          name: true,
          fieldType: true,
          isRequired: true,
          options: true,
        },
      });
    } catch (error) {
      this.logger.warn(
        `buildTenantContext: failed to fetch custom fields for tenant ${tenantId}`,
        error,
      );
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
    return withinBusinessHours(settings);
  }

  async appendAiActivity(
    ticketId: string,
    tenantId: string,
    entry: AiActivityEntry,
  ): Promise<void> {
    if (['needs_human', 'superseded', 'uncertain'].includes(entry.result.action)) return;
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const ticket = await tx.ticket.findFirst({ where: { id: ticketId, tenantId } });
      if (!ticket) return;
      const meta = (ticket.metadata as Record<string, any>) ?? {};
      const log = Array.isArray(meta.aiActivityLog) ? meta.aiActivityLog.slice(-49) : [];
      if (entry.operationId && log.some((item: any) => item.operationId === entry.operationId)) return;
      log.push({ id: randomUUID(), timestamp: new Date().toISOString(), ...entry });
      await tx.ticket.update({ where: { id: ticketId, tenantId }, data: { metadata: { ...meta, aiActivityLog: log } } });
    });
  }

  async runAgentLoop(
    systemPrompt: string, userMessage: string, tenantId: string,
    options: AgentOptions & { kind: OperationKind; ticketId: string; maxIterations?: number },
  ): Promise<AgentResult> {
    if (!this.enabled) return stopped('needs_human', 'OpenClaw is not configured');
    const operation = options.operation ?? await this.operations.prepare({
      id: options.requestId, tenantId, ticketId: options.ticketId, kind: options.kind, source: 'manual',
    });
    const claim = await this.operations.claim(operation.id, tenantId, options.ticketId,
      options.kind, operation.originMessageId, operation.source as OperationSource);
    if (!claim.scope) return claim.result;
    const scope = claim.scope;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const model = options.model || (tenant?.settings as any)?.openclawModel || this.defaultModel;
    const executed: AgentResult['toolCalls'] = [];
    const messages: ChatMessage[] = [
      { role: 'system', content: `${systemPrompt}\n\n${CONTEXT_RULES}\nTool mutations are staged until validation at completion. Never claim delivery or completion from a draft.` },
      { role: 'user', content: `${userMessage}\n\n${JSON.stringify(await loadThreadContext(this.prisma, tenantId, options.ticketId))}` },
    ];
    let result: AgentResult = stopped('needs_human', 'Agent did not complete');
    let completed = false;
    try {
      const maxIterations = Math.min(10, Math.max(1, options.maxIterations ?? 10));
      for (let i = 0; i < maxIterations; i++) {
        const response = await this.callChatCompletionWithTools(messages, model, options.kind);
        const message = response?.choices?.[0]?.message;
        if (!message) break;
        messages.push(message);
        if (!message.tool_calls?.length) {
          result = this.parseAgentResponse(message.content || '', executed);
          completed = result.action !== 'needs_human';
          // A useful draft may intentionally ask for a human.
          completed ||= typeof result.draftReply === 'string' && result.draftReply.length > 0;
          break;
        }
        if (!Array.isArray(message.tool_calls) || message.tool_calls.length > 12) break;
        for (const call of message.tool_calls) {
          let args: any;
          try { args = JSON.parse(call.function.arguments); } catch { args = null; }
          const name = call?.function?.name;
          const toolResult = await executeToolCall(name, args, scope, this.prisma, call.id);
          executed.push({ tool: name, args, result: toolResult });
          messages.push({ role: 'tool', content: toolResult, tool_call_id: call.id });
        }
      }
      const denied = executed.some(t => JSON.parse(t.result).error);
      if (!completed || denied) {
        scope.pending = [];
        result = { ...stopped('needs_human', denied ? 'A tool call was rejected; no proposed changes were applied' : 'Agent did not produce a valid completion; no proposed changes were applied'), toolCalls: executed };
      }
      return await this.finishOperation(scope, result, completed && !denied, executed);
    } catch (error) {
      // No retry of a claimed operation: a later duplicate returns uncertain.
      // Staged work has no effects until the atomic finish transaction commits.
      this.logger.error('Agent operation interrupted', error);
      return { ...stopped('uncertain', 'Operation interrupted; inspect its durable receipt before retrying'), toolCalls: executed };
    }
  }

  private async finishOperation(scope: OperationScope, proposed: AgentResult, completed: boolean,
    reads: AgentResult['toolCalls'] = []): Promise<AgentResult> {
    const effects: Array<[string, any]> = [];
    const finished = await this.operations.finish(scope, async tx => {
      const tenant = await tx.tenant.findUnique({ where: { id: scope.tenantId } });
      const threshold = (tenant?.settings as any)?.openclawConfidenceThreshold ?? 0.8;
      if (scope.pending.some(t => t.name === 'send_reply') && proposed.confidence < threshold) {
        scope.pending = [];
        completed = false;
      }
      const applied = await applyPendingTools(scope, tx, { emit: (name, value) => effects.push([name, value]) });
      const toolCalls = [...reads.filter(t => !JSON.parse(t.result).staged), ...applied];
      let result: AgentResult = { ...proposed, toolCalls };
      if (!completed) result = { ...stopped('needs_human', proposed.summary), toolCalls };
      else if (scope.kind === 'draft') result.action = result.draftReply ? 'drafted' : 'needs_human';
      else if (scope.kind === 'summary') result.action = 'summarized';
      else if (applied.some(t => t.tool === 'escalate')) result.action = 'escalated';
      else if (applied.some(t => t.tool === 'send_reply')) result.action = 'drafted';
      else result.action = applied.length ? 'triaged' : 'needs_human';
      if (result.action === 'drafted') result.summary = `Unsent draft for human review. ${scope.kind === 'draft' ? proposed.summary : 'No reply was delivered and the ticket was not resolved.'}`;
      if (scope.kind === 'draft' && scope.source === 'automation' && result.draftReply && completed && result.confidence >= threshold) {
        await tx.message.create({ data: { tenantId: scope.tenantId, ticketId: scope.ticketId,
          direction: 'OUTBOUND', messageType: 'AI_SUGGESTION', contentText: result.draftReply,
          metadata: { aiGenerated: true, operationId: scope.id, deliveryStatus: 'not_sent', confidence: result.confidence } } });
      }
      return { ...result, operationId: scope.id, delivery: 'not_sent', notification: 'best_effort' };
    });
    // A crash here cannot cause effects to be re-applied. Notifications are best
    // effort; callers reconcile persisted state, not a promise of exactly-once events.
    if (finished.committed) for (const [event, payload] of effects) {
      try { this.eventEmitter.emit(event, payload); } catch { this.logger.warn('Committed agent notification was not acknowledged'); }
    }
    return finished.result as unknown as AgentResult;
  }

  async generateDraftReply(
    ticketId: string,
    tenantId: string,
    options?: AgentOptions,
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
  "action": "drafted",
  "confidence": <0.0-1.0>,
  "summary": "<what the reply addresses and approach taken>",
  "draftReply": "<the actual reply text>",
  "sentiment": "<positive|neutral|negative|frustrated|angry>"
}`;

    return this.runAgentLoop(
      systemPrompt,
      `Please draft a reply for ticket ${ticketId}. First use get_ticket to understand the context.`,
      tenantId,
      { ...options, kind: 'draft', ticketId },
    );
  }

  async triageTicket(
    ticketId: string,
    tenantId: string,
    options?: AgentOptions,
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
      { ...options, kind: 'triage', ticketId },
    );
  }

  async attemptResolve(
    ticketId: string,
    tenantId: string,
    options?: AgentOptions,
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
- Only propose a solution if you have HIGH confidence (>= 0.8) that it addresses the issue
- Use send_reply to prepare an unsent solution for human review
- This adapter cannot confirm delivery or resolution. Return drafted or needs_human.
- If you cannot confidently resolve, use escalate with a detailed reason

## Output
Return ONLY a JSON object:
{
  "action": "drafted" | "escalated" | "needs_human",
  "confidence": <0.0-1.0>,
  "summary": "<what you found, what you did, and why>",
  "sentiment": "<positive|neutral|negative|frustrated|angry>"
}`;

    return this.runAgentLoop(
      systemPrompt,
      `Attempt to resolve ticket ${ticketId}. Start by gathering context with get_ticket, search_tickets, and get_contact_history.`,
      tenantId,
      { ...options, kind: 'resolve', ticketId },
    );
  }

  async summarizeTicket(
    ticketId: string,
    tenantId: string,
    options?: AgentOptions,
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
  "action": "summarized",
  "confidence": 1,
  "summary": "<Structured summary including: ISSUE: what the problem is | HISTORY: steps taken so far | STATUS: current state | SENTIMENT: customer mood | RECOMMENDED ACTIONS: 1. first action 2. second action>",
  "sentiment": "<positive|neutral|negative|frustrated|angry>"
}`;

    return this.runAgentLoop(
      systemPrompt,
      `Summarize ticket ${ticketId} with action items.`,
      tenantId,
      { ...options, kind: 'summary', ticketId },
    );
  }

  async handleWidgetMessage(
    ticketId: string,
    tenantId: string,
    customerMessage: string,
    options?: AgentOptions & { confidenceThreshold?: number },
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
- If confident (>= ${threshold}): use send_reply to prepare an unsent suggestion for human review
- If not confident: respond with action "needs_human" and a polite message about connecting them with a human
- Keep responses conversational and concise
- Match the company tone preference

## Output
Return ONLY a JSON object:
{
  "action": "drafted" | "needs_human",
  "confidence": <0.0-1.0>,
  "summary": "<brief description>",
  "draftReply": "<the reply text>",
  "sentiment": "<positive|neutral|negative|frustrated|angry>"
}`;

    return this.runAgentLoop(
      systemPrompt,
      `Customer message on ticket ${ticketId}: "${customerMessage}". Use get_ticket for full context.`,
      tenantId,
      { ...options, kind: 'auto-reply', ticketId },
    );
  }

  async prepareCallbackOperation(ticketId: string, tenantId: string, kind: OperationKind, id: string) {
    return this.operations.prepare({ ticketId, tenantId, kind, id, source: 'callback' });
  }

  async processWebhookEvent(
    event: import('./dto/agent-action.dto').WebhookEventType,
    ticketId: string, tenantId: string, payload: Record<string, any> | undefined,
    identity: { operationId: string; originMessageId: string | null; kind: OperationKind; eventId: string },
  ): Promise<AgentResult> {
    if (!identity?.operationId || !identity.eventId || !ALLOWED_TOOLS[identity.kind]) throw new Error('Callback identity is required');
    const claim = await this.operations.claim(identity.operationId, tenantId, ticketId,
      identity.kind, identity.originMessageId, 'callback', identity.eventId);
    if (!claim.scope) return claim.result;
    const scope = claim.scope;
    const content = payload?.result?.summary;
    let proposed: AgentResult = { ...stopped('needs_human', 'Callback requires human review'),
      ...(typeof content === 'string' ? { summary: content.slice(0, 16000) } : {}) };
    const calls: Array<{ name: string; args: Record<string, any> }> = [];
    if (event === 'agent.reply_sent') {
      proposed = stopped('uncertain', 'External reply delivery is unverified; no delivered message was recorded');
    } else if (event === 'agent.completed') {
      const raw = payload?.result;
      if (!raw || typeof raw.summary !== 'string' || raw.summary.length > 16000 ||
        typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) {
        proposed = stopped('needs_human', 'Invalid callback result');
      } else {
        proposed = this.parseAgentResponse(JSON.stringify(raw), []);
        if (['resolved', 'replied'].includes(raw.action)) proposed = stopped('needs_human', 'Callback cannot establish delivery or resolution');
        else if (proposed.action !== 'needs_human') {
          if (payload?.priority) calls.push({ name: 'update_ticket', args: { ticketId, priority: payload.priority } });
          if (payload?.tags) calls.push({ name: 'set_tags', args: { ticketId, tags: payload.tags } });
        }
      }
    } else if (event === 'agent.escalated') calls.push({ name: 'escalate', args: { ticketId, reason: payload?.reason } });
    else if (event !== 'agent.failed') throw new Error('Unknown callback event');
    const results: AgentResult['toolCalls'] = [];
    for (const [i, call] of calls.entries()) {
      const result = await executeToolCall(call.name, call.args, scope, this.prisma, `${identity.eventId}-${i}`);
      results.push({ tool: call.name, args: call.args, result });
    }
    const denied = results.some(t => JSON.parse(t.result).error);
    if (denied) { scope.pending = []; proposed = stopped('needs_human', 'Callback action rejected'); }
    // Reply-sent is a receipt of an unverified claim, never a new send command.
    if (event === 'agent.reply_sent') {
      const finished = await this.operations.finish(scope, async () => ({ ...proposed, eventId: identity.eventId }));
      return finished.result as unknown as AgentResult;
    }
    return this.finishOperation(scope, proposed, !denied && (calls.length > 0 || ['drafted', 'summarized'].includes(proposed.action)), results);
  }

  private async callChatCompletionWithTools(
    messages: ChatMessage[],
    model: string,
    kind: OperationKind,
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
          tools: TICKET_TOOLS.filter(t => ALLOWED_TOOLS[kind].includes(t.function.name)),
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
      const cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed || typeof parsed.summary !== 'string' || parsed.summary.length > 16000 ||
        typeof parsed.confidence !== 'number' || !Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1 ||
        (parsed.draftReply !== undefined && (typeof parsed.draftReply !== 'string' || parsed.draftReply.length > 16000))) throw new Error('Invalid agent result');
      return {
        action: ['drafted', 'summarized', 'triaged', 'escalated', 'needs_human'].includes(parsed.action) ? parsed.action : 'needs_human',
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
