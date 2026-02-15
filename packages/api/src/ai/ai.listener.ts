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
          direction: MessageDirection.INBOUND,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!firstMessage) {
        this.logger.debug(`No inbound message found for ticket ${ticket.id}`);
        return;
      }

      const startTime = Date.now();
      const classification = await this.aiService.classifyTicket({
        subject: ticket.subject,
        firstMessage: firstMessage.contentText,
      });

      if (!classification) {
        this.logger.debug(`Classification failed for ticket ${ticket.id}`);
        return;
      }

      const latencyMs = Date.now() - startTime;

      const updateData: any = {
        metadata: {
          ...(ticket.metadata as object),
          aiClassification: classification,
        },
      };

      if (classification.autoApply && classification.confidence > 0.85) {
        updateData.priority = classification.suggestedPriority;
        this.logger.log(
          `Auto-applied priority ${classification.suggestedPriority} to ticket ${ticket.id} (confidence: ${classification.confidence})`,
        );
      }

      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: updateData,
      });

      await this.aiInteractionService.logInteraction({
        tenantId,
        ticketId: ticket.id,
        action: 'auto_classify',
        model: 'gpt-3.5-turbo',
        latencyMs,
        accepted: classification.autoApply,
      });
    } catch (error) {
      this.logger.error(
        `Failed to auto-classify ticket ${ticket.id}`,
        error,
      );
    }
  }
}
