import { IsOptional, IsString, MaxLength, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ContactFiltersDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}
