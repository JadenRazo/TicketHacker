import { IsString, IsEnum, IsOptional } from 'class-validator';
import { MessageType } from '@prisma/client';

export class CreateMessageDto {
  @IsString()
  contentText: string;

  @IsString()
  @IsOptional()
  contentHtml?: string;

  @IsEnum(MessageType)
  @IsOptional()
  messageType?: MessageType = MessageType.TEXT;
}
