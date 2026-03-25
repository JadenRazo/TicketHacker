import { IsString, MaxLength, IsObject, IsOptional, IsBoolean } from 'class-validator';

export class UpdateSavedViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sortBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  sortOrder?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
