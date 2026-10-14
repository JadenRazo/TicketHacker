import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { OpenclawListener } from './openclaw.listener';
import { OpenclawService } from './openclaw.service';

export type ReplyAction = 'auto-reply' | 'resolve-attempt' | 'copilot-suggest';

export interface OpenclawJobData {
  action: 'auto-reply' | 'triage' | 'resolve-attempt' | 'copilot-suggest';
  ticketId: string;
  tenantId: string;
  operationId: string;
  originMessageId: string | null;
  replyAction?: ReplyAction;
  model?: string;
  customerMessage?: string;
}

@Injectable()
@Processor('openclaw-agent')
export class OpenclawAgentProcessor extends WorkerHost {
  constructor(private readonly openclawService: OpenclawService, private readonly listener: OpenclawListener) { super(); }

  async process(job: Job<OpenclawJobData>) {
    const data = job.data;
    if (!data.operationId || data.originMessageId === undefined) throw new Error('Legacy agent jobs require fresh operation identity');
    const options = { model: data.model, operation: { id: data.operationId,
      originMessageId: data.originMessageId, source: 'automation' as const } };
    switch (data.action) {
      case 'triage': {
        const result = await this.openclawService.triageTicket(data.ticketId, data.tenantId, options);
        if (result.action === 'triaged' && data.replyAction) {
          await this.listener.enqueueReply(data, data.replyAction, data.operationId);
        }
        return result;
      }
      case 'copilot-suggest': return this.openclawService.generateDraftReply(data.ticketId, data.tenantId, options);
      case 'resolve-attempt': return this.openclawService.attemptResolve(data.ticketId, data.tenantId, options);
      case 'auto-reply': return this.openclawService.handleWidgetMessage(data.ticketId, data.tenantId, data.customerMessage ?? '', options);
      default: throw new Error('Unknown agent job action');
    }
  }
}
