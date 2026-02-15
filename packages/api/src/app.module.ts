import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    EventEmitterModule.forRoot(),
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
  ],
})
export class AppModule {}
