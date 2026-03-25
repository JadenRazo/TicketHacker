import { IsString, MaxLength, IsOptional, IsEnum, IsUUID, IsArray } from 'class-validator';
import { MacroScope } from '@prisma/client';

export class UpdateMacroDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  actions?: any[];

  @IsOptional()
  @IsEnum(MacroScope)
  scope?: MacroScope;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
