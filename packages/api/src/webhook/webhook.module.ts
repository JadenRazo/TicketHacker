import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WebhookListener } from './webhook.listener';
import { WebhookProcessor } from './webhook.processor';

@Module({
  imports: [
    EventEmitterModule,
    BullModule.registerQueue({ name: 'webhook-delivery' }),
  ],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookListener, WebhookProcessor],
  exports: [WebhookService],
})
export class WebhookModule {}
