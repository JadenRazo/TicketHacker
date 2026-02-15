import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';

@Module({
  imports: [EventEmitterModule],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
