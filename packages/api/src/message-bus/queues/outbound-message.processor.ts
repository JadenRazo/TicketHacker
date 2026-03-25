import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatWidgetAdapter } from '../adapters/chat-widget.adapter';
import { DiscordAdapter } from '../adapters/discord.adapter';
import { TelegramAdapter } from '../adapters/telegram.adapter';
import { EmailAdapter } from '../adapters/email.adapter';
import { ChannelAdapter } from '../channel-adapter.interface';

@Injectable()
@Processor('outbound-messages')
export class OutboundMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboundMessageProcessor.name);
  private adapters: Map<string, ChannelAdapter>;

  constructor(
    private prisma: PrismaService,
    private chatWidgetAdapter: ChatWidgetAdapter,
    private discordAdapter: DiscordAdapter,
    private telegramAdapter: TelegramAdapter,
    private emailAdapter: EmailAdapter,
  ) {
    super();
    this.adapters = new Map<string, ChannelAdapter>([
      ['CHAT_WIDGET', this.chatWidgetAdapter],
      ['DISCORD', this.discordAdapter],
      ['TELEGRAM', this.telegramAdapter],
      ['EMAIL', this.emailAdapter],
    ]);
  }

  async process(job: Job<{ ticketId: string; content: string; tenantId: string }>) {
    const { ticketId, content, tenantId } = job.data;
    this.logger.log(`Processing outbound message for ticket ${ticketId}`);

    try {
      const ticket = await this.prisma.ticket.findFirst({
        where: { id: ticketId, tenantId },
        include: { contact: true },
      });

      if (!ticket) {
        this.logger.warn(`Ticket ${ticketId} not found`);
        return;
      }

      const adapter = this.adapters.get(ticket.channel);
      if (!adapter) {
        this.logger.warn(`No adapter for channel ${ticket.channel}`);
        return;
      }

      const connection = await this.prisma.platformConnection.findFirst({
        where: { tenantId, channel: ticket.channel, isActive: true },
      });

      await adapter.sendOutbound(
        {
          tenantId,
          ticketId,
          contactId: ticket.contactId,
          direction: 'OUTBOUND',
          contentText: content,
        },
        connection ? { config: connection.config as Record<string, any> } : { config: {} },
      );

      this.logger.log(`Outbound message delivered for ticket ${ticketId} via ${ticket.channel}`);
    } catch (error) {
      this.logger.error(`Failed to send outbound message for ticket ${ticketId}`, error);
      throw error;
    }
  }
}
