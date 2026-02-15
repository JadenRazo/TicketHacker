import { IsString, IsOptional, IsEnum, IsUUID, IsArray } from 'class-validator';
import { MacroScope } from '@prisma/client';

export class UpdateMacroDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
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
