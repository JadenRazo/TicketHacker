import {
  IsString,
  MinLength,
  MaxLength,
  IsUUID,
  IsEnum,
  IsOptional,
  IsArray,
  IsObject,
} from 'class-validator';
import { Channel, Priority } from '@prisma/client';

export class CreateTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subject: string;

  @IsUUID()
  contactId: string;

  @IsEnum(Channel)
  channel: Channel;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsUUID()
  @IsOptional()
  teamId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsObject()
  @IsOptional()
  customFields?: Record<string, any>;
}
