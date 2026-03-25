import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { UserModule } from './user/user.module';
import { TicketModule } from './ticket/ticket.module';
import { MessageModule } from './message/message.module';
import { ContactModule } from './contact/contact.module';
import { CannedResponseModule } from './canned-response/canned-response.module';
import { SavedViewModule } from './saved-view/saved-view.module';
import { MacroModule } from './macro/macro.module';
import { AutomationModule } from './automation/automation.module';
import { CustomFieldModule } from './custom-field/custom-field.module';
import { PlatformConnectionModule } from './platform-connection/platform-connection.module';
import { GatewayModule } from './gateway/gateway.module';
import { WidgetModule } from './widget/widget.module';
import { EmailModule } from './email/email.module';
import { AiModule } from './ai/ai.module';
import { DiscordModule } from './discord/discord.module';
import { TelegramModule } from './telegram/telegram.module';
import { MessageBusModule } from './message-bus/message-bus.module';
import { OpenclawModule } from './openclaw/openclaw.module';
import { HealthModule } from './health/health.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { WebhookModule } from './webhook/webhook.module';
import { CsatModule } from './csat/csat.module';
import { NotificationModule } from './notification/notification.module';
import { UploadModule } from './upload/upload.module';
import { PortalModule } from './portal/portal.module';
import { RoutingModule } from './routing/routing.module';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
      },
    }),
    PrismaModule,
    AuthModule,
    TenantModule,
    UserModule,
    TicketModule,
    MessageModule,
    ContactModule,
    CannedResponseModule,
    SavedViewModule,
    MacroModule,
    AutomationModule,
    CustomFieldModule,
    PlatformConnectionModule,
    GatewayModule,
    WidgetModule,
    EmailModule,
    AiModule,
    DiscordModule,
    TelegramModule,
    MessageBusModule,
    OpenclawModule,
    HealthModule,
    AnalyticsModule,
    KnowledgeBaseModule,
    WebhookModule,
    CsatModule,
    NotificationModule,
    UploadModule,
    PortalModule,
    RoutingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
