import { IsUUID } from 'class-validator';

export class ExecuteMacroDto {
  @IsUUID()
  ticketId: string;
}
