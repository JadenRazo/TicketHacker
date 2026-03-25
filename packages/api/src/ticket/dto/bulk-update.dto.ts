import {
  IsArray,
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TicketStatus, Priority } from '@prisma/client';

class BulkUpdateFields {
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsUUID()
  @IsOptional()
  assigneeId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

export class BulkUpdateDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ticketIds: string[];

  @ValidateNested()
  @Type(() => BulkUpdateFields)
  updates: BulkUpdateFields;
}
