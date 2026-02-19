import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebhookService } from './webhook.service';

@Injectable()
export class WebhookListener {
  private readonly logger = new Logger(WebhookListener.name);

  constructor(private readonly webhookService: WebhookService) {}

  @OnEvent('ticket.created')
  async handleTicketCreated(payload: { tenantId: string; ticket: any }): Promise<void> {
    try {
      await this.webhookService.queueDeliveries(
        payload.tenantId,
        'ticket.created',
        {
          event: 'ticket.created',
          ticket: this.sanitizeTicket(payload.ticket),
          timestamp: new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to queue webhook deliveries for ticket.created', error);
    }
  }

  @OnEvent('ticket.updated')
  async handleTicketUpdated(payload: { tenantId: string; ticket: any }): Promise<void> {
    try {
      await this.webhookService.queueDeliveries(
        payload.tenantId,
        'ticket.updated',
        {
          event: 'ticket.updated',
          ticket: this.sanitizeTicket(payload.ticket),
          timestamp: new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to queue webhook deliveries for ticket.updated', error);
    }
  }

  @OnEvent('message.created')
  async handleMessageCreated(payload: {
    tenantId: string;
    ticketId: string;
    message: any;
  }): Promise<void> {
    try {
      await this.webhookService.queueDeliveries(
        payload.tenantId,
        'message.created',
        {
          event: 'message.created',
          message: this.sanitizeMessage(payload.message),
          ticketId: payload.ticketId,
          timestamp: new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to queue webhook deliveries for message.created', error);
    }
  }

  @OnEvent('sla.breached')
  async handleSlaBreached(payload: { tenantId: string; ticket: any }): Promise<void> {
    try {
      await this.webhookService.queueDeliveries(
        payload.tenantId,
        'sla.breached',
        {
          event: 'sla.breached',
          ticket: this.sanitizeTicket(payload.ticket),
          timestamp: new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to queue webhook deliveries for sla.breached', error);
    }
  }

  /**
   * Return only fields that are safe to expose externally.
   * Strips metadata, customFields, and any internal implementation details.
   */
  private sanitizeTicket(ticket: any): Record<string, any> {
    return {
      id: ticket?.id,
      subject: ticket?.subject,
      status: ticket?.status,
      priority: ticket?.priority,
      channel: ticket?.channel,
      assigneeId: ticket?.assigneeId ?? null,
      teamId: ticket?.teamId ?? null,
      contactId: ticket?.contactId,
      tags: ticket?.tags ?? [],
      createdAt: ticket?.createdAt,
      updatedAt: ticket?.updatedAt,
      resolvedAt: ticket?.resolvedAt ?? null,
    };
  }

  /**
   * Return only fields that are safe to expose externally for messages.
   * Strips internal metadata and sender passwords.
   */
  private sanitizeMessage(message: any): Record<string, any> {
    return {
      id: message?.id,
      ticketId: message?.ticketId,
      direction: message?.direction,
      contentText: message?.contentText,
      messageType: message?.messageType,
      createdAt: message?.createdAt,
    };
  }
}
