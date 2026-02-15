import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { CannedResponseScope } from '@prisma/client';

export class UpdateCannedResponseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  shortcut?: string;

  @IsOptional()
  @IsEnum(CannedResponseScope)
  scope?: CannedResponseScope;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
