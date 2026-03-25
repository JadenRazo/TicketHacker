import { Injectable, Logger } from '@nestjs/common';

interface AiInteractionLog {
  tenantId: string;
  ticketId?: string;
  action: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  accepted?: boolean;
  timestamp: Date;
}

@Injectable()
export class AiInteractionService {
  private readonly logger = new Logger(AiInteractionService.name);

  async logInteraction(data: {
    tenantId: string;
    ticketId?: string;
    action: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs: number;
    accepted?: boolean;
  }): Promise<void> {
    const log: AiInteractionLog = {
      ...data,
      timestamp: new Date(),
    };

    this.logger.log(
      `AI Interaction: ${log.action} for ticket ${log.ticketId || 'N/A'} - ${log.latencyMs}ms`,
    );

    this.logger.debug(JSON.stringify(log));
  }
}
