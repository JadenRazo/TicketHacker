import { IsString, IsObject, IsOptional, IsBoolean } from 'class-validator';

export class CreateSavedViewDto {
  @IsString()
  name: string;

  @IsObject()
  filters: Record<string, any>;

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
