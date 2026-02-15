import { IsString, IsObject, IsOptional, IsBoolean, IsInt } from 'class-validator';

export class UpdateAutomationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, any>;

  @IsOptional()
  @IsObject()
  actions?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;
}
