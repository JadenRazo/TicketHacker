import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import {
  KnowledgeBaseController,
  KnowledgeBasePublicController,
} from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';

@Module({
  imports: [AiModule],
  controllers: [KnowledgeBaseController, KnowledgeBasePublicController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
