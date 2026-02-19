import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';

interface TicketUpdatedPayload {
  tenantId: string;
  ticket: {
    id: string;
    tenantId: string;
    status: string;
    channel: string;
    contactId: string;
  };
}

@Injectable()
export class CsatListener {
  private readonly logger = new Logger(CsatListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: EventsGateway,
  ) {}

  /**
   * Listens for ticket.updated events and triggers a CSAT survey when a ticket
   * transitions to RESOLVED status.
   *
   * For CHAT_WIDGET tickets the survey prompt is emitted as a Socket.IO event
   * (`csat:request`) to the ticket room so the widget can display the star
   * rating UI.
   *
   * For all other channels (EMAIL, TELEGRAM, DISCORD, API) a SYSTEM message is
   * appended to the conversation so the agent and the contact can see the
   * rating request in the thread.
   */
  @OnEvent('ticket.updated')
  async handleTicketUpdated(payload: TicketUpdatedPayload) {
    const { tenantId, ticket } = payload;

    if (ticket.status !== 'RESOLVED') {
      return;
    }

    // Check whether CSAT surveys are enabled for this tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    if (!tenant) return;

    const settings = (tenant.settings as Record<string, any>) ?? {};
    // csatEnabled defaults to true when the key is absent
    const csatEnabled = settings.csatEnabled !== false;

    if (!csatEnabled) {
      this.logger.debug(
        `CSAT disabled for tenant ${tenantId}, skipping survey for ticket ${ticket.id}`,
      );
      return;
    }

    // Check if a rating already exists for this ticket – avoid duplicate prompts
    const existingRating = await this.prisma.ticketRating.findUnique({
      where: { ticketId: ticket.id },
    });

    if (existingRating) {
      this.logger.debug(
        `Rating already exists for ticket ${ticket.id}, skipping survey trigger`,
      );
      return;
    }

    const delayMinutes: number = settings.csatDelay ?? 0;

    if (delayMinutes > 0) {
      // For delayed surveys we emit after the configured delay.
      // In production this should be a BullMQ-scheduled job; here we use a
      // lightweight setTimeout for simplicity since no new dependencies are
      // allowed.
      this.logger.log(
        `Scheduling CSAT survey for ticket ${ticket.id} in ${delayMinutes} minute(s)`,
      );
      setTimeout(() => {
        this.triggerSurvey(tenantId, ticket).catch((err) =>
          this.logger.error(
            `Delayed CSAT survey failed for ticket ${ticket.id}`,
            err,
          ),
        );
      }, delayMinutes * 60 * 1000);
    } else {
      await this.triggerSurvey(tenantId, ticket);
    }
  }

  private async triggerSurvey(
    tenantId: string,
    ticket: TicketUpdatedPayload['ticket'],
  ) {
    try {
      if (ticket.channel === 'CHAT_WIDGET') {
        // Emit `conversation:resolved` to the ticket room.  The widget already
        // listens for this event and will transition to its built-in star-rating
        // screen when it receives it.  We also emit the newer `csat:request`
        // event so any future widget versions can listen for the more specific
        // event name without a breaking change.
        this.gateway.server
          .to(`ticket:${ticket.id}`)
          .emit('conversation:resolved', { ticketId: ticket.id, tenantId });

        this.gateway.server
          .to(`ticket:${ticket.id}`)
          .emit('csat:request', { ticketId: ticket.id, tenantId });

        this.logger.log(
          `CSAT Socket.IO events emitted for widget ticket ${ticket.id}`,
        );
      } else {
        // For non-widget channels append a SYSTEM message that acts as the
        // survey prompt visible in the conversation timeline.
        await this.prisma.message.create({
          data: {
            tenantId,
            ticketId: ticket.id,
            direction: 'OUTBOUND',
            contentText:
              'Your ticket has been resolved. How would you rate your support experience? (1 = Poor, 5 = Excellent)',
            messageType: 'SYSTEM',
          },
        });

        this.logger.log(
          `CSAT system message created for ticket ${ticket.id} (channel: ${ticket.channel})`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to trigger CSAT survey for ticket ${ticket.id}`,
        error,
      );
    }
  }
}
