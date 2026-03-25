import {
  IsArray,
  IsOptional,
  IsEnum,
  IsUUID,
  IsString,
  MaxLength,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TicketStatus, Priority, Channel } from '@prisma/client';

export class TicketFiltersDto {
  @IsArray()
  @IsEnum(TicketStatus, { each: true })
  @IsOptional()
  status?: TicketStatus[];

  @IsArray()
  @IsEnum(Priority, { each: true })
  @IsOptional()
  priority?: Priority[];

  @IsUUID()
  @IsOptional()
  assigneeId?: string;

  @IsUUID()
  @IsOptional()
  teamId?: string;

  @IsArray()
  @IsEnum(Channel, { each: true })
  @IsOptional()
  channel?: Channel[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(500)
  search?: string;

  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  snoozed?: boolean;

  @IsUUID()
  @IsOptional()
  savedViewId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  sortBy?: string = 'createdAt';

  @IsString()
  @IsOptional()
  @MaxLength(10)
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsString()
  @IsOptional()
  @MaxLength(255)
  cursor?: string;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
