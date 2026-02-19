import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { UpdateWebhookEndpointDto } from './dto/update-webhook-endpoint.dto';

// Maximum deliveries to retain per endpoint before pruning older records
const MAX_DELIVERIES_PER_ENDPOINT = 100;

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('webhook-delivery') private readonly webhookQueue: Queue,
  ) {}

  async createEndpoint(tenantId: string, dto: CreateWebhookEndpointDto) {
    const secret = randomBytes(32).toString('hex');

    return this.prisma.webhookEndpoint.create({
      data: {
        tenantId,
        url: dto.url,
        secret,
        events: dto.events,
        description: dto.description,
        isActive: true,
      },
    });
  }

  async listEndpoints(tenantId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateEndpoint(tenantId: string, id: string, dto: UpdateWebhookEndpointDto) {
    await this.findEndpointOrFail(tenantId, id);

    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.events !== undefined && { events: dto.events }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  async deleteEndpoint(tenantId: string, id: string): Promise<void> {
    await this.findEndpointOrFail(tenantId, id);

    await this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  async getDeliveries(tenantId: string, endpointId: string, limit = 50) {
    // Verify the endpoint belongs to this tenant before exposing delivery data
    await this.findEndpointOrFail(tenantId, endpointId);

    return this.prisma.webhookDelivery.findMany({
      where: { tenantId, endpointId },
      orderBy: { deliveredAt: 'desc' },
      take: limit,
    });
  }

  async retryDelivery(tenantId: string, deliveryId: string): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery || delivery.tenantId !== tenantId) {
      throw new NotFoundException('Delivery not found');
    }

    if (delivery.success) {
      return; // Already succeeded, no retry needed
    }

    await this.webhookQueue.add(
      'deliver',
      {
        tenantId: delivery.tenantId,
        endpointId: delivery.endpointId,
        event: delivery.event,
        payload: delivery.payload,
        // Pass the original delivery id so the processor can record the retry
        retryOfDeliveryId: delivery.id,
      },
      {
        attempts: 1, // Manual retry — user triggered it explicitly
        backoff: { type: 'fixed', delay: 1000 },
      },
    );

    this.logger.log(`Queued manual retry for delivery ${deliveryId}`);
  }

  /**
   * Enqueue delivery jobs for all active endpoints subscribed to the given event.
   * Called by WebhookListener in response to domain events.
   */
  async queueDeliveries(
    tenantId: string,
    event: string,
    payload: Record<string, any>,
  ): Promise<void> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        tenantId,
        isActive: true,
        events: { has: event },
      },
    });

    if (endpoints.length === 0) {
      return;
    }

    for (const endpoint of endpoints) {
      await this.webhookQueue.add(
        'deliver',
        {
          tenantId,
          endpointId: endpoint.id,
          event,
          payload,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000, // 5s → 30s → 300s
          },
        },
      );

      this.logger.log(
        `Queued webhook delivery to ${endpoint.url} for event "${event}"`,
      );
    }
  }

  /**
   * Record a delivery attempt and prune old records beyond the retention cap.
   */
  async recordDelivery(data: {
    tenantId: string;
    endpointId: string;
    event: string;
    payload: Record<string, any>;
    statusCode: number | null;
    responseBody: string | null;
    success: boolean;
    attempt: number;
  }) {
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        tenantId: data.tenantId,
        endpointId: data.endpointId,
        event: data.event,
        payload: data.payload,
        statusCode: data.statusCode,
        responseBody: data.responseBody,
        success: data.success,
        attempt: data.attempt,
      },
    });

    // Prune deliveries beyond the retention cap (keep latest MAX_DELIVERIES_PER_ENDPOINT)
    this.pruneDeliveries(data.endpointId).catch((err) =>
      this.logger.warn(`Failed to prune deliveries for endpoint ${data.endpointId}: ${err.message}`),
    );

    return delivery;
  }

  async getEndpointById(id: string) {
    return this.prisma.webhookEndpoint.findUnique({ where: { id } });
  }

  private async pruneDeliveries(endpointId: string): Promise<void> {
    // Find the id of the Nth delivery (the oldest one we still want to keep)
    const cutoff = await this.prisma.webhookDelivery.findMany({
      where: { endpointId },
      orderBy: { deliveredAt: 'desc' },
      skip: MAX_DELIVERIES_PER_ENDPOINT,
      take: 1,
      select: { deliveredAt: true },
    });

    if (cutoff.length === 0) {
      return; // Still within the cap
    }

    await this.prisma.webhookDelivery.deleteMany({
      where: {
        endpointId,
        deliveredAt: { lte: cutoff[0].deliveredAt },
      },
    });
  }

  private async findEndpointOrFail(tenantId: string, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!endpoint || endpoint.tenantId !== tenantId) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    return endpoint;
  }
}
