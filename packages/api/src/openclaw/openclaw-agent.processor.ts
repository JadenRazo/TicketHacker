import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OpenclawService } from './openclaw.service';
import { PrismaService } from '../prisma/prisma.service';

interface OpenclawJobData {
  action: 'auto-reply' | 'triage' | 'resolve-attempt' | 'copilot-suggest';
  ticketId: string;
  tenantId: string;
  model?: string;
  customerMessage?: string;
  confidenceThreshold?: number;
}

@Injectable()
@Processor('openclaw-agent')
export class OpenclawAgentProcessor extends WorkerHost {
  private readonly logger = new Logger(OpenclawAgentProcessor.name);

  constructor(
    private openclawService: OpenclawService,
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<OpenclawJobData>) {
    const { action, ticketId, tenantId, model, customerMessage, confidenceThreshold } =
      job.data;
    this.logger.log(
      `Processing OpenClaw agent task: ${action} for ticket ${ticketId}`,
    );

    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        this.logger.warn(`Tenant ${tenantId} not found, skipping`);
        return;
      }

      const settings = tenant.settings as any;
      if (!settings?.openclawEnabled) {
        this.logger.debug(
          `OpenClaw disabled for tenant ${tenantId}, skipping`,
        );
        return;
      }

      const agentModel = model || settings.openclawModel;
      const threshold =
        confidenceThreshold || settings.openclawConfidenceThreshold || 0.8;

      switch (action) {
        case 'triage': {
          const result = await this.openclawService.triageTicket(
            ticketId,
            tenantId,
            { model: agentModel },
          );

          await this.prisma.ticket.update({
            where: { id: ticketId },
            data: {
              metadata: {
                aiTriage: {
                  action: result.action,
                  confidence: result.confidence,
                  summary: result.summary,
                  toolCalls: result.toolCalls.length,
                  processedAt: new Date().toISOString(),
                },
              },
            },
          });

          await this.openclawService.appendAiActivity(ticketId, tenantId, {
            action: 'triage',
            result: {
              action: result.action,
              confidence: result.confidence,
              summary: result.summary,
            },
            triggeredBy: 'auto-triage',
            toolCallCount: result.toolCalls.length,
          });

          this.logger.log(
            `Triage completed for ticket ${ticketId}: ${result.action} (confidence: ${result.confidence})`,
          );
          return result;
        }

        case 'auto-reply': {
          const agentMode = settings.openclawAgentMode || 'copilot';

          if (agentMode === 'autonomous') {
            const result = await this.openclawService.handleWidgetMessage(
              ticketId,
              tenantId,
              customerMessage || '',
              { model: agentModel, confidenceThreshold: threshold },
            );

            await this.openclawService.appendAiActivity(ticketId, tenantId, {
              action: 'draft-reply',
              result: {
                action: result.action,
                confidence: result.confidence,
                summary: result.summary,
              },
              triggeredBy: 'auto-reply',
              toolCallCount: result.toolCalls.length,
            });

            this.logger.log(
              `Auto-reply for ticket ${ticketId}: ${result.action} (confidence: ${result.confidence})`,
            );
            return result;
          } else {
            const result = await this.openclawService.generateDraftReply(
              ticketId,
              tenantId,
              { model: agentModel },
            );

            if (result.draftReply) {
              await this.prisma.message.create({
                data: {
                  tenantId,
                  ticketId,
                  direction: 'OUTBOUND',
                  contentText: result.draftReply,
                  messageType: 'AI_SUGGESTION',
                  metadata: {
                    aiGenerated: true,
                    confidence: result.confidence,
                  },
                },
              });
            }

            await this.openclawService.appendAiActivity(ticketId, tenantId, {
              action: 'draft-reply',
              result: {
                action: result.action,
                confidence: result.confidence,
                summary: result.summary,
              },
              triggeredBy: 'auto-reply',
              toolCallCount: result.toolCalls.length,
            });

            this.logger.log(
              `Draft reply generated for ticket ${ticketId} (confidence: ${result.confidence})`,
            );
            return result;
          }
        }

        case 'resolve-attempt': {
          const result = await this.openclawService.attemptResolve(
            ticketId,
            tenantId,
            { model: agentModel },
          );

          await this.prisma.ticket.update({
            where: { id: ticketId },
            data: {
              metadata: {
                aiResolveAttempt: {
                  action: result.action,
                  confidence: result.confidence,
                  summary: result.summary,
                  processedAt: new Date().toISOString(),
                },
              },
            },
          });

          await this.openclawService.appendAiActivity(ticketId, tenantId, {
            action: 'resolve',
            result: {
              action: result.action,
              confidence: result.confidence,
              summary: result.summary,
            },
            triggeredBy: 'auto-reply',
            toolCallCount: result.toolCalls.length,
          });

          this.logger.log(
            `Resolve attempt for ticket ${ticketId}: ${result.action}`,
          );
          return result;
        }

        case 'copilot-suggest': {
          const result = await this.openclawService.generateDraftReply(
            ticketId,
            tenantId,
            { model: agentModel },
          );

          if (result.draftReply && result.confidence >= threshold) {
            const suggestion = await this.prisma.message.create({
              data: {
                tenantId,
                ticketId,
                direction: 'OUTBOUND',
                contentText: result.draftReply,
                messageType: 'AI_SUGGESTION',
                metadata: {
                  aiGenerated: true,
                  confidence: result.confidence,
                  summary: result.summary,
                  toolCalls: result.toolCalls.length,
                },
              },
            });

            this.eventEmitter.emit('message.created', {
              tenantId,
              ticketId,
              message: suggestion,
            });
          }

          await this.openclawService.appendAiActivity(ticketId, tenantId, {
            action: 'draft-reply',
            result: {
              action: result.action,
              confidence: result.confidence,
              summary: result.summary,
            },
            triggeredBy: 'copilot',
            toolCallCount: result.toolCalls.length,
          });

          this.logger.log(
            `Copilot suggestion generated for ticket ${ticketId} (confidence: ${result.confidence})`,
          );
          return result;
        }

        default:
          this.logger.warn(`Unknown OpenClaw agent action: ${action}`);
      }
    } catch (error) {
      this.logger.error(
        `OpenClaw agent task ${action} failed for ticket ${ticketId}`,
        error,
      );
      throw error;
    }
  }
}
