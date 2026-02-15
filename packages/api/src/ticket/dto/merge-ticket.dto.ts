import { IsUUID } from 'class-validator';

export class MergeTicketDto {
  @IsUUID()
  targetTicketId: string;
}
