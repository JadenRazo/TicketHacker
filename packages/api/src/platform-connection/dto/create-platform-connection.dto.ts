import { IsEnum, IsObject, IsOptional, IsBoolean } from 'class-validator';
import { Channel } from '@prisma/client';

export class CreatePlatformConnectionDto {
  @IsEnum(Channel)
  channel: Channel;

  @IsObject()
  config: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
