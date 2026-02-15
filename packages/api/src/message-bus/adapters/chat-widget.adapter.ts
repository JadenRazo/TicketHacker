import { Injectable } from '@nestjs/common';
import {
  ChannelAdapter,
  UnifiedMessage,
} from '../channel-adapter.interface';

@Injectable()
export class ChatWidgetAdapter implements ChannelAdapter {
  readonly channel = 'CHAT_WIDGET';

  async handleInbound(raw: any, tenantId: string): Promise<UnifiedMessage> {
    return {
      tenantId,
      ticketId: raw.ticketId,
      contactId: raw.contactId,
      direction: 'INBOUND',
      contentText: raw.content,
      metadata: raw.metadata || {},
    };
  }

  async sendOutbound(
    message: UnifiedMessage,
  ): Promise<string | null> {
    // Chat widget messages are delivered via Socket.IO, no external API call needed
    return null;
  }

  async validateConnection(): Promise<boolean> {
    return true;
  }
}
