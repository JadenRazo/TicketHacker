import { IsString, IsObject, IsOptional, IsBoolean } from 'class-validator';

export class UpdateSavedViewDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
