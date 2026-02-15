import { IsOptional, IsString, IsIn } from 'class-validator';

export class AgentActionDto {
  @IsOptional()
  @IsString()
  model?: string;
}

export class WebhookInboundDto {
  @IsString()
  event: string;

  @IsOptional()
  @IsString()
  ticketId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  payload?: Record<string, any>;
}
