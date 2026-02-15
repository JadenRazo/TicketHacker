import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { CannedResponseScope } from '@prisma/client';

export class CreateCannedResponseDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  shortcut?: string;

  @IsOptional()
  @IsEnum(CannedResponseScope)
  scope?: CannedResponseScope = CannedResponseScope.TENANT;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
