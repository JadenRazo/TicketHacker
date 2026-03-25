import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationEngine } from './automation.engine';
import { AutomationListener } from './automation.listener';

@Module({
  imports: [EventEmitterModule],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationEngine, AutomationListener],
  exports: [AutomationService, AutomationEngine],
})
export class AutomationModule {}
