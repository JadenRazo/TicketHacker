import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
@Processor('maintenance')
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<{ task: string }>) {
    const { task } = job.data;
    this.logger.log(`Running maintenance task: ${task}`);

    switch (task) {
      case 'auto-close-resolved':
        await this.autoCloseResolved();
        break;
      case 'unsnooze-tickets':
        await this.unsnoozeTickets();
        break;
      case 'sla-breach-check':
        await this.checkSlaBreaches();
        break;
    }
  }

  private async autoCloseResolved() {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const tickets = await this.prisma.ticket.findMany({
      where: {
        status: 'RESOLVED',
        resolvedAt: { lt: threeDaysAgo },
      },
    });

    for (const ticket of tickets) {
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      this.eventEmitter.emit('ticket.updated', {
        tenantId: ticket.tenantId,
        ticket: { ...ticket, status: 'CLOSED' },
      });
    }

    this.logger.log(`Auto-closed ${tickets.length} resolved tickets`);
  }

  private async unsnoozeTickets() {
    const now = new Date();
    const tickets = await this.prisma.ticket.findMany({
      where: {
        snoozedUntil: { lte: now },
        status: { not: 'CLOSED' },
      },
    });

    for (const ticket of tickets) {
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { snoozedUntil: null },
      });
      this.eventEmitter.emit('ticket.updated', {
        tenantId: ticket.tenantId,
        ticket: { ...ticket, snoozedUntil: null },
      });
    }

    this.logger.log(`Unsnoozed ${tickets.length} tickets`);
  }

  private async checkSlaBreaches() {
    const now = new Date();
    const tickets = await this.prisma.ticket.findMany({
      where: {
        slaDeadline: { lte: now },
        status: { in: ['OPEN', 'PENDING'] },
      },
      include: { tenant: true },
    });

    for (const ticket of tickets) {
      this.eventEmitter.emit('sla.breached', {
        tenantId: ticket.tenantId,
        ticket,
      });
    }

    this.logger.log(`Found ${tickets.length} SLA breaches`);
  }
}
