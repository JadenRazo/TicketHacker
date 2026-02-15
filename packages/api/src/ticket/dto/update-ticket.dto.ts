import {
  IsString,
  IsEnum,
  IsUUID,
  IsOptional,
  IsArray,
  IsObject,
  IsDateString,
} from 'class-validator';
import { TicketStatus, Priority } from '@prisma/client';

export class UpdateTicketDto {
  @IsString()
  @IsOptional()
  subject?: string;

  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsUUID()
  @IsOptional()
  assigneeId?: string;

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

  @IsDateString()
  @IsOptional()
  snoozedUntil?: string;
}
