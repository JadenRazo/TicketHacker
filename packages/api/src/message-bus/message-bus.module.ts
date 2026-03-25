import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatWidgetAdapter } from './adapters/chat-widget.adapter';
import { DiscordAdapter } from './adapters/discord.adapter';
import { TelegramAdapter } from './adapters/telegram.adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { OutboundMessageProcessor } from './queues/outbound-message.processor';
import { AiTaskProcessor } from './queues/ai-task.processor';
import { MaintenanceProcessor } from './queues/maintenance.processor';
import { DiscordModule } from '../discord/discord.module';
import { TelegramModule } from '../telegram/telegram.module';
import { EmailModule } from '../email/email.module';
import { AiModule } from '../ai/ai.module';
import { MessageBusService } from './message-bus.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6381),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'outbound-messages' },
      { name: 'ai-tasks' },
      { name: 'email-send' },
      { name: 'notifications' },
      { name: 'maintenance' },
    ),
    DiscordModule,
    TelegramModule,
    EmailModule,
    AiModule,
  ],
  providers: [
    ChatWidgetAdapter,
    DiscordAdapter,
    TelegramAdapter,
    EmailAdapter,
    OutboundMessageProcessor,
    AiTaskProcessor,
    MaintenanceProcessor,
    MessageBusService,
  ],
  exports: [MessageBusService],
})
export class MessageBusModule {}
