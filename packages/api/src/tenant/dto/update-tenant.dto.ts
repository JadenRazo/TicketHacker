import { IsString, IsOptional, IsObject, MaxLength } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, any>;
}
