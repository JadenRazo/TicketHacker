import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Bot, webhookCallback } from 'grammy';
import { PrismaService } from '../prisma/prisma.service';
import { Channel, MessageDirection, MessageType, TicketStatus } from '@prisma/client';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private bots: Map<string, Bot> = new Map();

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private config: ConfigService,
  ) {}

  async registerBot(tenantId: string, botToken: string) {
    try {
      const bot = new Bot(botToken);

      const botInfo = await bot.api.getMe();
      this.logger.log(`Registering Telegram bot: @${botInfo.username} for tenant ${tenantId}`);

      await this.prisma.platformConnection.upsert({
        where: {
          tenantId_channel: {
            tenantId,
            channel: Channel.TELEGRAM,
          },
        },
        update: {
          config: { botToken, username: botInfo.username },
          isActive: true,
        },
        create: {
          tenantId,
          channel: Channel.TELEGRAM,
          config: { botToken, username: botInfo.username },
          isActive: true,
        },
      });

      const appUrl = this.config.get<string>('APP_URL');
      if (!appUrl) {
        throw new Error('APP_URL not configured');
      }

      const webhookUrl = `${appUrl}/api/telegram/webhook/${tenantId}`;
      await bot.api.setWebhook(webhookUrl);

      this.bots.set(tenantId, bot);

      this.logger.log(`Telegram bot registered successfully for tenant ${tenantId}`);

      return {
        success: true,
        username: botInfo.username,
        webhookUrl,
      };
    } catch (error) {
      this.logger.error('Error registering Telegram bot:', error);
      throw new BadRequestException('Invalid bot token or registration failed');
    }
  }

  async handleWebhook(tenantId: string, update: any) {
    try {
      const message = update.message;
      if (!message || !message.text) {
        return;
      }

      const chatId = message.chat.id.toString();
      const userId = message.from.id.toString();
      const userName = message.from.username || message.from.first_name || 'Telegram User';
      const messageText = message.text;
      const messageId = message.message_id.toString();

      const existingMessage = await this.prisma.message.findFirst({
        where: {
          externalId: messageId,
          tenantId,
        },
      });

      if (existingMessage) {
        return;
      }

      const contact = await this.prisma.contact.upsert({
        where: {
          tenantId_channel_externalId: {
            tenantId,
            channel: Channel.TELEGRAM,
            externalId: chatId,
          },
        },
        update: {
          name: userName,
        },
        create: {
          tenantId,
          externalId: chatId,
          name: userName,
          channel: Channel.TELEGRAM,
          metadata: {
            userId,
            firstName: message.from.first_name,
            lastName: message.from.last_name,
            username: message.from.username,
          },
        },
      });

      let ticket = await this.prisma.ticket.findFirst({
        where: {
          tenantId,
          contactId: contact.id,
          channel: Channel.TELEGRAM,
          status: {
            in: [TicketStatus.OPEN, TicketStatus.PENDING],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!ticket) {
        const subject = messageText.length > 100
          ? `${messageText.slice(0, 100)}...`
          : messageText;

        ticket = await this.prisma.ticket.create({
          data: {
            tenantId,
            subject,
            channel: Channel.TELEGRAM,
            contactId: contact.id,
            metadata: {
              chatId,
            },
          },
        });

        this.eventEmitter.emit('ticket.created', { tenantId, ticket });
      }

      const newMessage = await this.prisma.message.create({
        data: {
          tenantId,
          ticketId: ticket.id,
          contactId: contact.id,
          direction: MessageDirection.INBOUND,
          contentText: messageText,
          messageType: MessageType.TEXT,
          externalId: messageId,
        },
      });

      this.eventEmitter.emit('message.created', {
        tenantId,
        message: newMessage,
        ticketId: ticket.id,
      });

      this.logger.log(`Processed Telegram message for ticket ${ticket.id}`);
    } catch (error) {
      this.logger.error('Error handling Telegram webhook:', error);
    }
  }

  async sendOutbound(ticketId: string, content: string) {
    try {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          contact: true,
        },
      });

      if (!ticket || ticket.channel !== Channel.TELEGRAM) {
        throw new Error('Invalid ticket or channel');
      }

      const connection = await this.prisma.platformConnection.findUnique({
        where: {
          tenantId_channel: {
            tenantId: ticket.tenantId,
            channel: Channel.TELEGRAM,
          },
        },
      });

      if (!connection || !connection.isActive) {
        throw new Error('Telegram connection not found or inactive');
      }

      let bot = this.bots.get(ticket.tenantId);

      if (!bot) {
        const config = connection.config as any;
        bot = new Bot(config.botToken);
        this.bots.set(ticket.tenantId, bot);
      }

      const chatId = ticket.contact.externalId;
      const sentMessage = await bot.api.sendMessage(chatId, content);

      await this.prisma.message.updateMany({
        where: {
          ticketId,
          contentText: content,
          direction: MessageDirection.OUTBOUND,
          externalId: null,
        },
        data: {
          externalId: sentMessage.message_id.toString(),
        },
      });

      return {
        success: true,
        messageId: sentMessage.message_id.toString(),
      };
    } catch (error) {
      this.logger.error('Error sending outbound Telegram message:', error);
      throw error;
    }
  }

  async removeBot(tenantId: string) {
    try {
      const bot = this.bots.get(tenantId);

      if (bot) {
        await bot.api.deleteWebhook();
        this.bots.delete(tenantId);
      }

      await this.prisma.platformConnection.updateMany({
        where: {
          tenantId,
          channel: Channel.TELEGRAM,
        },
        data: {
          isActive: false,
        },
      });

      this.logger.log(`Removed Telegram bot for tenant ${tenantId}`);

      return {
        success: true,
        message: 'Telegram bot removed successfully',
      };
    } catch (error) {
      this.logger.error('Error removing Telegram bot:', error);
      throw error;
    }
  }

  getBotStatus(tenantId: string) {
    const bot = this.bots.get(tenantId);
    return {
      registered: !!bot,
      tenantId,
    };
  }

  async getAllBotStatuses(tenantId: string) {
    const connection = await this.prisma.platformConnection.findUnique({
      where: {
        tenantId_channel: {
          tenantId,
          channel: Channel.TELEGRAM,
        },
      },
    });

    if (!connection) {
      return {
        registered: false,
        active: false,
      };
    }

    const config = connection.config as any;
    return {
      registered: true,
      active: connection.isActive,
      username: config.username || null,
    };
  }
}
