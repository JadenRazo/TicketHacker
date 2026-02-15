import { Injectable } from '@nestjs/common';
import { DiscordService } from '../../discord/discord.service';
import {
  ChannelAdapter,
  UnifiedMessage,
} from '../channel-adapter.interface';

@Injectable()
export class DiscordAdapter implements ChannelAdapter {
  readonly channel = 'DISCORD';

  constructor(private discordService: DiscordService) {}

  async handleInbound(raw: any, tenantId: string): Promise<UnifiedMessage> {
    return {
      tenantId,
      ticketId: raw.ticketId,
      contactId: raw.contactId,
      direction: 'INBOUND',
      contentText: raw.content,
      externalId: raw.messageId,
      metadata: { guildId: raw.guildId, threadId: raw.threadId },
    };
  }

  async sendOutbound(
    message: UnifiedMessage,
  ): Promise<string | null> {
    await this.discordService.sendOutbound(
      message.ticketId,
      message.contentText,
    );
    return null;
  }

  async validateConnection(config: Record<string, any>): Promise<boolean> {
    return !!config.botToken;
  }
}
