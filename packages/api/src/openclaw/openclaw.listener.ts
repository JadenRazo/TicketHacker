import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OpenclawService } from './openclaw.service';

@Injectable()
export class OpenclawListener {
  private readonly logger = new Logger(OpenclawListener.name);

  constructor(
    @InjectQueue('openclaw-agent') private openclawQueue: Queue,
    private prisma: PrismaService,
  ) {}

  @OnEvent('ticket.created')
  async handleTicketCreated(payload: {
    tenantId: string;
    ticket: any;
  }): Promise<void> {
    const { tenantId, ticket } = payload;

    try {
      const settings = await this.getTenantSettings(tenantId);
      if (!settings?.openclawEnabled || !settings?.openclawAutoTriage) {
        return;
      }

      await this.openclawQueue.add(
        'triage',
        {
          action: 'triage',
          ticketId: ticket.id,
          tenantId,
        },
        {
          attempts: 2,
          backoff: { type: 'exponential', delay: 3000 },
          delay: 1000,
        },
      );

      this.logger.log(
        `Queued OpenClaw triage for ticket ${ticket.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue OpenClaw triage for ticket ${ticket.id}`,
        error,
      );
    }
  }

  @OnEvent('message.created')
  async handleMessageCreated(payload: {
    tenantId: string;
    ticketId: string;
    message: any;
  }): Promise<void> {
    const { tenantId, ticketId, message } = payload;

    if (message.direction !== 'INBOUND') return;

    try {
      const settings = await this.getTenantSettings(tenantId);
      if (!settings?.openclawEnabled) return;

      const ticket = await this.prisma.ticket.findFirst({
        where: { id: ticketId, tenantId },
        select: { channel: true },
      });

      if (!ticket) return;

      const agentMode = settings.openclawAgentMode || 'copilot';

      if (
        ticket.channel === 'CHAT_WIDGET' &&
        settings.openclawWidgetAgent
      ) {
        const action = settings.openclawWidgetResolve
          ? 'resolve-attempt'
          : 'auto-reply';

        await this.openclawQueue.add(
          action,
          {
            action,
            ticketId,
            tenantId,
            customerMessage: message.contentText,
            confidenceThreshold: settings.openclawConfidenceThreshold,
          },
          {
            attempts: 2,
            backoff: { type: 'exponential', delay: 2000 },
          },
        );

        this.logger.log(
          `Queued OpenClaw ${action} for widget ticket ${ticketId}`,
        );
      } else if (agentMode === 'autonomous') {
        if (!OpenclawService.isWithinBusinessHours(settings)) {
          // Outside business hours: degrade to copilot mode
          await this.openclawQueue.add(
            'copilot-suggest',
            {
              action: 'copilot-suggest',
              ticketId,
              tenantId,
              customerMessage: message.contentText,
            },
            {
              attempts: 2,
              backoff: { type: 'exponential', delay: 3000 },
            },
          );
          this.logger.log(
            `Outside business hours: queued copilot-suggest instead of auto-reply for ticket ${ticketId}`,
          );
          return;
        }

        const recentAiReplies = await this.prisma.message.count({
          where: {
            ticketId,
            tenantId,
            messageType: { in: ['AI_SUGGESTION', 'TEXT'] },
            metadata: { path: ['aiGenerated'], equals: true },
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        });

        const rateLimit = settings.openclawRateLimit || 5;
        if (recentAiReplies >= rateLimit) {
          this.logger.warn(
            `Rate limit: skipping auto-reply for ticket ${ticketId}, ${recentAiReplies} AI replies in last hour`,
          );
          return;
        }

        await this.openclawQueue.add(
          'auto-reply',
          {
            action: 'auto-reply',
            ticketId,
            tenantId,
            customerMessage: message.contentText,
          },
          {
            attempts: 2,
            backoff: { type: 'exponential', delay: 2000 },
          },
        );

        this.logger.log(
          `Queued OpenClaw auto-reply for ticket ${ticketId}`,
        );
      } else if (agentMode === 'copilot') {
        const shouldAutoSuggest = settings.openclawAutoSuggest !== false; // default true
        if (shouldAutoSuggest) {
          await this.openclawQueue.add(
            'copilot-suggest',
            {
              action: 'copilot-suggest',
              ticketId,
              tenantId,
              customerMessage: message.contentText,
            },
            {
              attempts: 2,
              backoff: { type: 'exponential', delay: 3000 },
              priority: 10,
            },
          );
          this.logger.log(
            `Queued OpenClaw copilot suggestion for ticket ${ticketId}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to queue OpenClaw task for message on ticket ${ticketId}`,
        error,
      );
    }
  }

  private async getTenantSettings(
    tenantId: string,
  ): Promise<Record<string, any> | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    return (tenant?.settings as Record<string, any>) || null;
  }
}
