import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHmac } from 'crypto';
import { WebhookService } from './webhook.service';

interface WebhookDeliveryJobData {
  tenantId: string;
  endpointId: string;
  event: string;
  payload: Record<string, any>;
  /** Set when this job was triggered by a manual retry of an existing delivery */
  retryOfDeliveryId?: string;
}

// Maximum length of response body to store; prevents unbounded storage of large responses
const MAX_RESPONSE_BODY_LENGTH = 500;

// In production we only deliver to HTTPS endpoints; HTTP is permitted in development
const REQUIRE_HTTPS = process.env.NODE_ENV === 'production';

@Injectable()
@Processor('webhook-delivery')
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly webhookService: WebhookService) {
    super();
  }

  async process(job: Job<WebhookDeliveryJobData>): Promise<void> {
    const { tenantId, endpointId, event, payload } = job.data;
    const attempt = job.attemptsMade + 1;

    this.logger.log(
      `Processing webhook delivery for event "${event}" to endpoint ${endpointId} (attempt ${attempt})`,
    );

    // Fetch the endpoint to ensure it is still active and to obtain the signing secret
    const endpoint = await this.webhookService.getEndpointById(endpointId);

    if (!endpoint) {
      this.logger.warn(
        `Webhook endpoint ${endpointId} not found — skipping delivery`,
      );
      return;
    }

    if (!endpoint.isActive) {
      this.logger.debug(
        `Webhook endpoint ${endpointId} is inactive — skipping delivery`,
      );
      return;
    }

    if (REQUIRE_HTTPS && !endpoint.url.startsWith('https://')) {
      this.logger.warn(
        `Skipping delivery to non-HTTPS URL in production: ${endpoint.url}`,
      );
      await this.webhookService.recordDelivery({
        tenantId,
        endpointId,
        event,
        payload,
        statusCode: null,
        responseBody: 'Delivery blocked: HTTPS required in production',
        success: false,
        attempt,
      });
      return;
    }

    // Build HMAC-SHA256 signature over the serialised payload
    const bodyString = JSON.stringify(payload);
    const signature = createHmac('sha256', endpoint.secret)
      .update(bodyString)
      .digest('hex');

    const deliveryId = job.id ?? `${endpointId}-${Date.now()}`;

    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let success = false;

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event': event,
          'X-Webhook-Delivery': deliveryId,
        },
        body: bodyString,
        // Enforce a reasonable timeout so slow receivers don't block the worker
        signal: AbortSignal.timeout(30_000),
      });

      statusCode = response.status;
      const rawBody = await response.text();
      responseBody = rawBody.slice(0, MAX_RESPONSE_BODY_LENGTH);
      success = response.ok;

      if (!success) {
        this.logger.warn(
          `Webhook delivery to ${endpoint.url} returned HTTP ${statusCode} (attempt ${attempt})`,
        );
        // Throw so BullMQ will retry according to the job options
        throw new Error(`HTTP ${statusCode}: ${responseBody}`);
      }

      this.logger.log(
        `Webhook delivered successfully to ${endpoint.url} for event "${event}"`,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        responseBody = 'Request timed out after 30s';
      } else if (!responseBody && error instanceof Error) {
        responseBody = error.message.slice(0, MAX_RESPONSE_BODY_LENGTH);
      }

      // Always record the attempt before re-throwing so retries are tracked
      await this.webhookService.recordDelivery({
        tenantId,
        endpointId,
        event,
        payload,
        statusCode,
        responseBody,
        success: false,
        attempt,
      });

      throw error; // Let BullMQ handle retry scheduling
    }

    // Record successful delivery
    await this.webhookService.recordDelivery({
      tenantId,
      endpointId,
      event,
      payload,
      statusCode,
      responseBody,
      success: true,
      attempt,
    });
  }
}
