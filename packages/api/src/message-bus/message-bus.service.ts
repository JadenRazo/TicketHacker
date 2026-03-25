import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class MessageBusService {
  private readonly logger = new Logger(MessageBusService.name);

  constructor(
    @InjectQueue('outbound-messages') private outboundQueue: Queue,
    @InjectQueue('ai-tasks') private aiQueue: Queue,
    @InjectQueue('maintenance') private maintenanceQueue: Queue,
  ) {}

  async queueOutboundMessage(data: {
    ticketId: string;
    content: string;
    tenantId: string;
  }) {
    await this.outboundQueue.add('send', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    this.logger.log(`Queued outbound message for ticket ${data.ticketId}`);
  }

  async queueAiTask(data: {
    action: 'classify' | 'embed' | 'summarize';
    ticketId: string;
    tenantId: string;
  }) {
    await this.aiQueue.add(data.action, data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      priority: data.action === 'classify' ? 1 : 5,
    });
    this.logger.log(`Queued AI task ${data.action} for ticket ${data.ticketId}`);
  }

  async queueMaintenance(task: string) {
    await this.maintenanceQueue.add(task, { task }, {
      attempts: 1,
    });
  }

  async setupRecurringJobs() {
    await this.maintenanceQueue.upsertJobScheduler(
      'auto-close-resolved',
      { every: 60 * 60 * 1000 },
      { data: { task: 'auto-close-resolved' } },
    );

    await this.maintenanceQueue.upsertJobScheduler(
      'unsnooze-tickets',
      { every: 60 * 1000 },
      { data: { task: 'unsnooze-tickets' } },
    );

    await this.maintenanceQueue.upsertJobScheduler(
      'sla-breach-check',
      { every: 5 * 60 * 1000 },
      { data: { task: 'sla-breach-check' } },
    );

    this.logger.log('Recurring maintenance jobs scheduled');
  }
}
