import { loadThreadContext } from './thread-context';
import { applyClassificationIfCurrent } from './state-guard';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AiService } from './ai.service';
import { AiInteractionService } from './ai-interaction.service';
import { PrismaService } from '../prisma/prisma.service';
import { MessageDirection } from '@prisma/client';

@Injectable()
export class AiListener {
  private readonly logger = new Logger(AiListener.name);

  constructor(
    private readonly aiService: AiService,
    private readonly aiInteractionService: AiInteractionService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('ticket.created')
  async handleTicketCreated(payload: {
    tenantId: string;
    ticket: any;
  }): Promise<void> {
    const { tenantId, ticket } = payload;

    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        return;
      }

      const settings = tenant.settings as any;
      const aiEnabled = settings?.aiEnabled !== false;

      if (!aiEnabled) {
        this.logger.debug(`AI is disabled for tenant ${tenantId}`);
        return;
      }

      const firstMessage = await this.prisma.message.findFirst({
        where: {
          ticketId: ticket.id,
          tenantId,
          direction: MessageDirection.INBOUND,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!firstMessage) {
        this.logger.debug(`No inbound message found for ticket ${ticket.id}`);
        return;
      }

      const currentTicket = await this.prisma.ticket.findFirst({ where: { id: ticket.id, tenantId } });
      if (!currentTicket) return;
      const startTime = Date.now();
      const classification = await this.aiService.classifyTicket({
        subject: currentTicket.subject,
        firstMessage: firstMessage.contentText,
        context: await loadThreadContext(this.prisma, tenantId, ticket.id),
      });

      if (!classification) {
        this.logger.debug(`Classification failed for ticket ${ticket.id}`);
        return;
      }

      const latencyMs = Date.now() - startTime;

      const applied = await applyClassificationIfCurrent(this.prisma, tenantId, ticket.id,
        currentTicket.agentVersion, settings, classification,
        classification.autoApply && classification.confidence > 0.85 ? classification.suggestedPriority : undefined);

      await this.aiInteractionService.logInteraction({
        tenantId,
        ticketId: ticket.id,
        action: 'auto_classify',
        model: 'gpt-3.5-turbo',
        latencyMs,
        accepted: applied && classification.autoApply,
      });
    } catch (error) {
      this.logger.error(`Failed to auto-classify ticket ${ticket.id}`, error);
    }
  }
}
