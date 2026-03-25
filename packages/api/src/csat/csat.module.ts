import { Module } from '@nestjs/common';
import { CsatController } from './csat.controller';
import { CsatService } from './csat.service';
import { CsatListener } from './csat.listener';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    // GatewayModule exports EventsGateway which the listener uses to emit
    // Socket.IO events to the ticket room.
    GatewayModule,
  ],
  controllers: [CsatController],
  providers: [CsatService, CsatListener],
  exports: [CsatService],
})
export class CsatModule {}
