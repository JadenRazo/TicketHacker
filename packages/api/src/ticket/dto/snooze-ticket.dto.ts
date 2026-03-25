import { IsDateString, IsOptional } from 'class-validator';

export class SnoozeTicketDto {
  @IsDateString()
  @IsOptional()
  until?: string | null;
}
