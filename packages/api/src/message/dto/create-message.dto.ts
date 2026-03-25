import { IsString, MaxLength, IsEnum, IsOptional, IsArray, IsUUID } from 'class-validator';
import { MessageType } from '@prisma/client';

export class CreateMessageDto {
  @IsString()
  @MaxLength(50000)
  contentText: string;

  @IsString()
  @IsOptional()
  @MaxLength(100000)
  contentHtml?: string;

  @IsEnum(MessageType)
  @IsOptional()
  messageType?: MessageType = MessageType.TEXT;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  attachmentIds?: string[];
}
