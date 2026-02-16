import { IsString, MaxLength, IsObject, IsOptional, IsBoolean, IsInt } from 'class-validator';

export class CreateAutomationDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsObject()
  conditions: Record<string, any>;

  @IsObject()
  actions: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @IsInt()
  priority?: number = 0;
}
