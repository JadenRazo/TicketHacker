import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OpenclawService } from './openclaw.service';
import { OpenclawController } from './openclaw.controller';
import { OpenclawAgentProcessor } from './openclaw-agent.processor';
import { OpenclawListener } from './openclaw.listener';

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule,
    BullModule.registerQueue({ name: 'openclaw-agent' }),
  ],
  controllers: [OpenclawController],
  providers: [
    OpenclawService,
    OpenclawAgentProcessor,
    OpenclawListener,
  ],
  exports: [OpenclawService],
})
export class OpenclawModule {}
