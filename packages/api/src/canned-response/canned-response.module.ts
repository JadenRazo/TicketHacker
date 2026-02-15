import { Module } from '@nestjs/common';
import { CannedResponseController } from './canned-response.controller';
import { CannedResponseService } from './canned-response.service';

@Module({
  controllers: [CannedResponseController],
  providers: [CannedResponseService],
  exports: [CannedResponseService],
})
export class CannedResponseModule {}
