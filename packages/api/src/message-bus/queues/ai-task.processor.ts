import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { applyClassificationIfCurrent } from '../../ai/state-guard';
import { loadThreadContext } from '../../ai/thread-context';
import { AiService } from '../../ai/ai.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
@Processor('ai-tasks')
export class AiTaskProcessor extends WorkerHost {
  private readonly logger = new Logger(AiTaskProcessor.name);

  constructor(
    private aiService: AiService,
    private prisma: PrismaService,
  ) {
    super();
  }

  async process(
    job: Job<{
      action: 'classify' | 'embed' | 'summarize';
      ticketId: string;
      tenantId: string;
    }>,
  ) {
    const { action, ticketId, tenantId } = job.data;
    this.logger.log(`Processing AI task: ${action} for ticket ${ticketId}`);

    try {
      switch (action) {
        case 'classify': {
          const ticket = await this.prisma.ticket.findFirst({
            where: { id: ticketId, tenantId },
            include: {
              tenant: { select: { settings: true } },
              messages: { orderBy: { createdAt: 'asc' }, take: 1 },
            },
          });
          if (!ticket) return;

          const classification = await this.aiService.classifyTicket({
            subject: ticket.subject,
            firstMessage: ticket.messages[0]?.contentText || '',
            context: await loadThreadContext(this.prisma, tenantId, ticketId),
          });

          if (classification) {
            const applied = await applyClassificationIfCurrent(this.prisma, tenantId, ticketId,
              ticket.agentVersion, ticket.tenant.settings, classification);
            return { classification, applied };
          }
          break;
        }

        case 'summarize': {
          const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
          if (!ticket) return;
          const context = await loadThreadContext(this.prisma, tenantId, ticketId);
          await this.aiService.summarizeThread(context);
          break;
        }

        case 'embed': {
          const ticket = await this.prisma.ticket.findFirst({
            where: { id: ticketId, tenantId },
          });
          if (!ticket) return;
          await this.aiService.generateEmbedding(ticket.subject);
          break;
        }
      }
    } catch (error) {
      this.logger.error(
        `AI task ${action} failed for ticket ${ticketId}`,
        error,
      );
      throw error;
    }
  }
}
