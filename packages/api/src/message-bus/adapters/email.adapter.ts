import { Injectable } from '@nestjs/common';
import { EmailService } from '../../email/email.service';
import {
  ChannelAdapter,
  UnifiedMessage,
} from '../channel-adapter.interface';

@Injectable()
export class EmailAdapter implements ChannelAdapter {
  readonly channel = 'EMAIL';

  constructor(private emailService: EmailService) {}

  async handleInbound(raw: any, tenantId: string): Promise<UnifiedMessage> {
    return {
      tenantId,
      ticketId: raw.ticketId,
      contactId: raw.contactId,
      direction: 'INBOUND',
      contentText: raw.text,
      contentHtml: raw.html,
      externalId: raw.messageId,
      metadata: {
        subject: raw.subject,
        from: raw.from,
        headers: raw.headers,
      },
    };
  }

  async sendOutbound(
    message: UnifiedMessage,
  ): Promise<string | null> {
    await this.emailService.sendOutbound(
      message.ticketId,
      message.contentText,
    );
    return `email-${message.ticketId}-${Date.now()}`;
  }

  async validateConnection(config: Record<string, any>): Promise<boolean> {
    return !!config.smtpHost;
  }
}
