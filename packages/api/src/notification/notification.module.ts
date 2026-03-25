import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationListener } from './notification.listener';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationListener],
  exports: [NotificationService],
})
export class NotificationModule {}
