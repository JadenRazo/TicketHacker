import { IsString, MaxLength, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class InboundEmailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  from: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  to: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100000)
  text: string;

  @IsString()
  @IsOptional()
  @MaxLength(200000)
  html?: string;

  @IsObject()
  @IsOptional()
  headers?: {
    messageId?: string;
    inReplyTo?: string;
    references?: string;
  };
}
