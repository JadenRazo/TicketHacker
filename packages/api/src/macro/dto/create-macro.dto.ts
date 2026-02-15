import { IsString, IsOptional, IsEnum, IsUUID, IsArray } from 'class-validator';
import { MacroScope } from '@prisma/client';

export class CreateMacroDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  actions: any[];

  @IsOptional()
  @IsEnum(MacroScope)
  scope?: MacroScope = MacroScope.TENANT;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
