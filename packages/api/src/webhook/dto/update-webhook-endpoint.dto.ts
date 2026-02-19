import { IsUrl, IsArray, IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';

const SUPPORTED_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'message.created',
  'sla.breached',
];

export class UpdateWebhookEndpointDto {
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'url must be a valid URL' })
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(SUPPORTED_EVENTS, { each: true, message: 'Invalid event type' })
  events?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}
