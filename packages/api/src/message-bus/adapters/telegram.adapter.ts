import { Injectable } from '@nestjs/common';
import { TelegramService } from '../../telegram/telegram.service';
import {
  ChannelAdapter,
  UnifiedMessage,
} from '../channel-adapter.interface';

@Injectable()
export class TelegramAdapter implements ChannelAdapter {
  readonly channel = 'TELEGRAM';

  constructor(private telegramService: TelegramService) {}

  async handleInbound(raw: any, tenantId: string): Promise<UnifiedMessage> {
    return {
      tenantId,
      ticketId: raw.ticketId,
      contactId: raw.contactId,
      direction: 'INBOUND',
      contentText: raw.text,
      externalId: raw.messageId?.toString(),
      metadata: { chatId: raw.chatId },
    };
  }

  async sendOutbound(
    message: UnifiedMessage,
  ): Promise<string | null> {
    const result = await this.telegramService.sendOutbound(
      message.ticketId,
      message.contentText,
    );
    return result?.messageId || null;
  }

  async validateConnection(config: Record<string, any>): Promise<boolean> {
    return !!config.botToken;
  }
}
