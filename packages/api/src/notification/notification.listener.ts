import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

const INBOUND = 'INBOUND';

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * ticket.created: Notify all active agents in the tenant.
   * The actor who created the ticket is excluded from notifications.
   */
  @OnEvent('ticket.created')
  async handleTicketCreated(payload: {
    tenantId: string;
    ticket: any;
    actorId?: string;
  }): Promise<void> {
    try {
      const { tenantId, ticket, actorId } = payload;

      const agents = await this.prisma.user.findMany({
        where: {
          tenantId,
          isActive: true,
          ...(actorId ? { id: { not: actorId } } : {}),
        },
        select: { id: true },
      });

      const subject = ticket.subject ?? '';
      const body = subject.length > 100 ? subject.slice(0, 97) + '...' : subject;

      await Promise.all(
        agents.map((agent) =>
          this.createAndEmit(tenantId, agent.id, {
            type: 'new_ticket',
            title: 'New ticket',
            body,
            ticketId: ticket.id,
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle ticket.created notification: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * ticket.updated: When the assignee changes, notify the new assignee.
   * The actor who made the change is excluded.
   */
  @OnEvent('ticket.updated')
  async handleTicketUpdated(payload: {
    tenantId: string;
    ticket: any;
    previousAssigneeId?: string;
    actorId?: string;
  }): Promise<void> {
    try {
      const { tenantId, ticket, previousAssigneeId, actorId } = payload;

      // Only act when an assignee is now set and it changed
      if (!ticket.assigneeId) return;

      const assigneeChanged = ticket.assigneeId !== previousAssigneeId;
      if (!assigneeChanged) return;

      // Don't notify the agent who performed the reassignment
      if (actorId && ticket.assigneeId === actorId) return;

      await this.createAndEmit(tenantId, ticket.assigneeId, {
        type: 'ticket_assigned',
        title: 'Ticket assigned to you',
        body: ticket.subject ?? '',
        ticketId: ticket.id,
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle ticket.updated notification: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * sla.breached: Notify the ticket assignee. If unassigned, notify all agents.
   */
  @OnEvent('sla.breached')
  async handleSlaBreached(payload: {
    tenantId: string;
    ticket: any;
  }): Promise<void> {
    try {
      const { tenantId, ticket } = payload;

      const subject = ticket.subject ?? '';
      const body = `Ticket '${subject}' has breached its SLA deadline`;

      if (ticket.assigneeId) {
        await this.createAndEmit(tenantId, ticket.assigneeId, {
          type: 'sla_warning',
          title: 'SLA breach',
          body,
          ticketId: ticket.id,
        });
      } else {
        const agents = await this.prisma.user.findMany({
          where: { tenantId, isActive: true },
          select: { id: true },
        });

        await Promise.all(
          agents.map((agent) =>
            this.createAndEmit(tenantId, agent.id, {
              type: 'sla_warning',
              title: 'SLA breach',
              body,
              ticketId: ticket.id,
            }),
          ),
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle sla.breached notification: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * message.created (INBOUND only): Notify the ticket assignee.
   * Skip if message was sent by the assignee themselves (system-generated
   * inbound messages via external channels won't have a senderId).
   */
  @OnEvent('message.created')
  async handleMessageCreated(payload: {
    tenantId: string;
    ticketId: string;
    message: any;
  }): Promise<void> {
    try {
      const { tenantId, ticketId, message } = payload;

      // Only handle inbound customer messages
      if (message.direction !== INBOUND) return;

      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { assigneeId: true, subject: true },
      });

      if (!ticket?.assigneeId) return;

      // Don't notify if the assignee sent the message (shouldn't happen for
      // inbound, but guards against edge cases)
      if (message.senderId && message.senderId === ticket.assigneeId) return;

      const rawContent = message.contentText ?? '';
      const body =
        rawContent.length > 100 ? rawContent.slice(0, 97) + '...' : rawContent;

      await this.createAndEmit(tenantId, ticket.assigneeId, {
        type: 'new_message',
        title: 'New customer message',
        body,
        ticketId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle message.created notification: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Creates the Notification record and emits a socket.io event via the
   * internal event bus. The gateway picks this up and broadcasts to the
   * tenant room. Clients filter by userId client-side.
   */
  private async createAndEmit(
    tenantId: string,
    userId: string,
    data: { type: string; title: string; body: string; ticketId?: string },
  ): Promise<void> {
    try {
      const notification = await this.notificationService.create(
        tenantId,
        userId,
        data,
      );

      this.eventEmitter.emit('notification.created', {
        tenantId,
        userId,
        notification,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create or emit notification for user ${userId}: ${error.message}`,
        error.stack,
      );
      // Notification failures must never propagate and block core operations
    }
  }
}
