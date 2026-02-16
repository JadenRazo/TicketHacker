import { IsString, MaxLength, IsEnum, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { CustomFieldType } from '@prisma/client';

export class CreateCustomFieldDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEnum(CustomFieldType)
  fieldType: CustomFieldType;

  @IsOptional()
  @IsObject()
  options?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean = false;
}
