import { IsOptional, IsString, MaxLength, IsIn, IsObject } from 'class-validator';

export class AgentActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;
}

export type WebhookEventType =
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.reply_sent'
  | 'agent.escalated';

export class WebhookInboundDto {
  @IsString()
  @IsIn(['agent.completed', 'agent.failed', 'agent.reply_sent', 'agent.escalated'])
  event: WebhookEventType;

  @IsString()
  @MaxLength(255)
  ticketId: string;

  @IsString()
  @MaxLength(255)
  tenantId: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}
