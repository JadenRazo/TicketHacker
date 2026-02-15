import { IsString, IsOptional, IsObject } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, any>;
}
