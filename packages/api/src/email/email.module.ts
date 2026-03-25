import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';

@Module({
  imports: [ConfigModule, EventEmitterModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
