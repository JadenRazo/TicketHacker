import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class MessageFiltersDto {
  @IsString()
  @IsOptional()
  cursor?: string;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;
}
