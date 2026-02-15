import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class InboundEmailDto {
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsOptional()
  html?: string;

  @IsObject()
  @IsOptional()
  headers?: {
    messageId?: string;
    inReplyTo?: string;
    references?: string;
  };
}
