import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
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
              messages: { orderBy: { createdAt: 'asc' }, take: 1 },
            },
          });
          if (!ticket) return;

          const classification = await this.aiService.classifyTicket({
            subject: ticket.subject,
            firstMessage: ticket.messages[0]?.contentText || '',
          });

          if (classification) {
            await this.prisma.ticket.update({
              where: { id: ticketId },
              data: {
                metadata: {
                  ...(ticket.metadata as Record<string, unknown>),
                  aiClassification: classification as any,
                } as any,
              },
            });
          }
          break;
        }

        case 'summarize': {
          const messages = await this.prisma.message.findMany({
            where: { ticketId, tenantId },
            orderBy: { createdAt: 'asc' },
            select: { direction: true, contentText: true, messageType: true },
          });

          const formatted = messages.map((m) => ({
            role: m.direction === 'INBOUND' ? 'user' : 'assistant',
            content: m.contentText,
          }));

          await this.aiService.summarizeThread(formatted);
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
      this.logger.error(`AI task ${action} failed for ticket ${ticketId}`, error);
      throw error;
    }
  }
}
