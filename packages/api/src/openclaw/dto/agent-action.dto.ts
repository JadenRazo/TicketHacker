import { IsOptional, IsString, MaxLength, IsIn } from 'class-validator';

export class AgentActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;
}

export class WebhookInboundDto {
  @IsString()
  @MaxLength(100)
  event: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ticketId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  tenantId?: string;

  @IsOptional()
  payload?: Record<string, any>;
}
