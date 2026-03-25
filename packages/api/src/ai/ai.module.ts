import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiInteractionService } from './ai-interaction.service';
import { AiListener } from './ai.listener';

@Module({
  imports: [ConfigModule, EventEmitterModule],
  controllers: [AiController],
  providers: [AiService, AiInteractionService, AiListener],
  exports: [AiService, AiInteractionService],
})
export class AiModule {}
