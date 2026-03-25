import { IsString, MaxLength, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { CannedResponseScope } from '@prisma/client';

export class UpdateCannedResponseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortcut?: string;

  @IsOptional()
  @IsEnum(CannedResponseScope)
  scope?: CannedResponseScope;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
