import { IsString, MaxLength, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { CannedResponseScope } from '@prisma/client';

export class CreateCannedResponseDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(10000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortcut?: string;

  @IsOptional()
  @IsEnum(CannedResponseScope)
  scope?: CannedResponseScope = CannedResponseScope.TENANT;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
