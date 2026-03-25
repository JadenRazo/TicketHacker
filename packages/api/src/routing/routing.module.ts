import { Module } from '@nestjs/common';
import { RoutingService } from './routing.service';
import { RoutingController } from './routing.controller';
import { RoutingListener } from './routing.listener';

@Module({
  controllers: [RoutingController],
  providers: [RoutingService, RoutingListener],
  exports: [RoutingService],
})
export class RoutingModule {}
