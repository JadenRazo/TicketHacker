import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingService } from './routing.service';

@Injectable()
export class RoutingListener {
  private readonly logger = new Logger(RoutingListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
  ) {}

  /**
   * Handles ticket.created events. When routing is enabled for the tenant,
   * computes an auto-assignment and writes it directly to the ticket.
   *
   * Intentionally does NOT re-emit ticket.updated to avoid triggering
   * automation or notification loops — assignment is treated as a silent
   * side-effect of ticket creation.
   */
  @OnEvent('ticket.created')
  async handleTicketCreated(payload: {
    tenantId: string;
    ticket: any;
  }): Promise<void> {
    try {
      const { tenantId, ticket } = payload;

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });

      const settings = tenant?.settings as Record<string, any> | null;

      if (!settings?.routingEnabled) return;

      // Skip if the ticket was already assigned (e.g. created with explicit assignee)
      if (ticket.assigneeId && ticket.teamId) return;

      const assignment = await this.routingService.autoAssign(tenantId, ticket);

      if (!assignment.assigneeId && !assignment.teamId) return;

      const updateData: any = {};
      if (assignment.assigneeId && !ticket.assigneeId) {
        updateData.assigneeId = assignment.assigneeId;
      }
      if (assignment.teamId && !ticket.teamId) {
        updateData.teamId = assignment.teamId;
      }

      if (Object.keys(updateData).length === 0) return;

      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: updateData,
      });

      this.logger.log(
        `Auto-assigned ticket ${ticket.id}: ${JSON.stringify(updateData)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to auto-assign ticket ${payload.ticket?.id}: ${error.message}`,
        error.stack,
      );
      // Routing failures must not block ticket creation
    }
  }
}
