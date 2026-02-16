import { IsString, MaxLength, IsOptional, IsEnum, IsUUID, IsArray } from 'class-validator';
import { MacroScope } from '@prisma/client';

export class CreateMacroDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
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
