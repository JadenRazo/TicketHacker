import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AgentOperations, operationId } from './agent-operations';
import { OpenclawService } from './openclaw.service';
import type { OpenclawJobData, ReplyAction } from './openclaw-agent.processor';
import type { OperationKind } from './action-policy';

@Injectable()
export class OpenclawListener {
  private readonly logger = new Logger(OpenclawListener.name);
  constructor(@InjectQueue('openclaw-agent') private readonly queue: Queue,
    private readonly prisma: PrismaService, private readonly operations: AgentOperations) {}

  private async enqueue(action: OpenclawJobData['action'], kind: OperationKind, tenantId: string,
    ticketId: string, originMessageId: string | null, customerMessage?: string, replyAction?: ReplyAction, predecessorId?: string) {
    const id = operationId(tenantId, ticketId, kind, originMessageId ?? 'ticket-created');
    await this.operations.prepare({ id, tenantId, ticketId, kind, source: 'automation', originMessageId, predecessorId });
    // The database receipt is the durable identity even after Bull removes a job.
    await this.queue.add(action, { action, tenantId, ticketId, operationId: id, originMessageId, customerMessage, ...(replyAction ? { replyAction } : {}) },
      { jobId: id, attempts: 2, backoff: { type: 'exponential', delay: 3000 } });
  }

  private async replyAction(settings: any, ticket: any): Promise<ReplyAction | undefined> {
    const mode = settings.openclawAgentMode || 'copilot';
    if (ticket.channel === 'CHAT_WIDGET' && settings.openclawWidgetAgent) {
      return settings.openclawWidgetResolve ? 'resolve-attempt' : 'auto-reply';
    }
    if (mode === 'autonomous' && OpenclawService.isWithinBusinessHours(settings)) {
      const recent = await this.prisma.message.count({ where: { ticketId: ticket.id, tenantId: ticket.tenantId,
        metadata: { path: ['aiGenerated'], equals: true }, createdAt: { gte: new Date(Date.now() - 3600000) } } });
      if (recent < (settings.openclawRateLimit ?? 5)) return 'auto-reply';
    } else if (settings.openclawAutoSuggest !== false && ['copilot', 'autonomous'].includes(mode)) {
      return 'copilot-suggest';
    }
  }

  async enqueueReply(data: Pick<OpenclawJobData, 'tenantId' | 'ticketId' | 'originMessageId' | 'customerMessage'>, action: ReplyAction, predecessorId?: string) {
    const kind = { 'copilot-suggest': 'draft', 'auto-reply': 'auto-reply', 'resolve-attempt': 'resolve' }[action] as OperationKind;
    if (!kind) throw new Error('Unknown dependent reply action');
    await this.enqueue(action, kind, data.tenantId, data.ticketId, data.originMessageId,
      data.customerMessage, undefined, predecessorId);
  }

  private async enqueueInitialTriage(tenantId: string, ticket: any, settings: any, messageId?: string) {
    const first = await this.prisma.message.findFirst({
      where: { tenantId, ticketId: ticket.id, direction: 'INBOUND', messageType: 'TEXT' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, contentText: true },
    });
    if (!first || (messageId && first.id !== messageId)) return false;
    // Both event orders use one identity. Only triage is prepared here; its
    // successful receipt authorizes preparation of the dependent reply later.
    await this.enqueue('triage', 'triage', tenantId, ticket.id, first.id, first.contentText ?? '',
      await this.replyAction(settings, ticket));
    return true;
  }

  @OnEvent('ticket.created')
  async handleTicketCreated({ tenantId, ticket }: { tenantId: string; ticket: any }) {
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const settings = tenant?.settings as any;
      if (!settings?.openclawEnabled || !settings.openclawAutoTriage) return;
      const current = await this.prisma.ticket.findFirst({ where: { id: ticket.id, tenantId } });
      if (current) await this.enqueueInitialTriage(tenantId, current, settings);
    } catch (error) { this.logger.warn('Triage was not queued', error); }
  }

  @OnEvent('message.created')
  async handleMessageCreated({ tenantId, ticketId, message }: { tenantId: string; ticketId: string; message: any }) {
    if (message.direction !== 'INBOUND' || message.messageType !== 'TEXT' || !message.id) return;
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const settings = tenant?.settings as any;
      if (!settings?.openclawEnabled || settings.openclawAgentMode === 'off') return;
      const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
      if (!ticket) return;
      const origin = await this.prisma.message.findFirst({ where: { id: message.id, ticketId, tenantId, direction: 'INBOUND', messageType: 'TEXT' } });
      if (!origin) return;
      if (settings.openclawAutoTriage && await this.enqueueInitialTriage(tenantId, ticket, settings, origin.id)) return;
      const action = await this.replyAction(settings, ticket);
      if (action) await this.enqueueReply({ tenantId, ticketId, originMessageId: origin.id,
        customerMessage: origin.contentText }, action);
    } catch (error) { this.logger.warn('Agent message job was not queued', error); }
  }
}
