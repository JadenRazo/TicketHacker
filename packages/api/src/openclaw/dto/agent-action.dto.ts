import {
  IsOptional,
  IsString,
  MaxLength,
  IsIn,
  IsObject,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import type { OperationKind } from '../action-policy';

export class AgentActionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  operationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;
}

export class PrepareAgentOperationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  operationId: string;

  @IsIn(['draft', 'summary', 'triage', 'resolve', 'auto-reply'])
  kind: OperationKind;
}

export type WebhookEventType =
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.reply_sent'
  | 'agent.escalated';

export class WebhookInboundDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  operationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  eventId: string;

  // null is explicit for a ticket created without any inbound messages.
  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  originMessageId: string | null;

  @IsIn(['draft', 'summary', 'triage', 'resolve', 'auto-reply'])
  kind: OperationKind;

  @IsString()
  @IsIn([
    'agent.completed',
    'agent.failed',
    'agent.reply_sent',
    'agent.escalated',
  ])
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
