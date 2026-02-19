import { IsUrl, IsArray, IsString, IsOptional, ArrayNotEmpty, IsIn } from 'class-validator';

const SUPPORTED_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'message.created',
  'sla.breached',
];

export class CreateWebhookEndpointDto {
  @IsUrl({ require_tld: false }, { message: 'url must be a valid URL' })
  url: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'At least one event must be selected' })
  @IsString({ each: true })
  @IsIn(SUPPORTED_EVENTS, { each: true, message: 'Invalid event type' })
  events: string[];

  @IsOptional()
  @IsString()
  description?: string;
}
