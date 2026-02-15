import { Module } from '@nestjs/common';
import { SavedViewController } from './saved-view.controller';
import { SavedViewService } from './saved-view.service';

@Module({
  controllers: [SavedViewController],
  providers: [SavedViewService],
  exports: [SavedViewService],
})
export class SavedViewModule {}
