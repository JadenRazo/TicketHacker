import { IsString, IsEnum, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { CustomFieldType } from '@prisma/client';

export class UpdateCustomFieldDto {
  @IsOptional()
  @IsString()
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
