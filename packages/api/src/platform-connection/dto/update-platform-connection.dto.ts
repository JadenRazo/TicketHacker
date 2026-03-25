import { IsObject, IsOptional, IsBoolean } from 'class-validator';

export class UpdatePlatformConnectionDto {
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
