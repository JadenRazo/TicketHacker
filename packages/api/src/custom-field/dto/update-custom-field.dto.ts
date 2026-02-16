import { IsString, MaxLength, IsEnum, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { CustomFieldType } from '@prisma/client';

export class UpdateCustomFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(CustomFieldType)
  fieldType?: CustomFieldType;

  @IsOptional()
  @IsObject()
  options?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}
