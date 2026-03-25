import { Module } from '@nestjs/common';
import { PlatformConnectionController } from './platform-connection.controller';
import { PlatformConnectionService } from './platform-connection.service';

@Module({
  controllers: [PlatformConnectionController],
  providers: [PlatformConnectionService],
  exports: [PlatformConnectionService],
})
export class PlatformConnectionModule {}
