import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { HealthService } from './health.service';

@Module({
  controllers: [ContactController],
  providers: [ContactService, HealthService],
  exports: [ContactService, HealthService],
})
export class ContactModule {}
