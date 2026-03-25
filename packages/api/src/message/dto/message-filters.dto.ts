import { IsString, MaxLength, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class MessageFiltersDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  cursor?: string;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;
}
