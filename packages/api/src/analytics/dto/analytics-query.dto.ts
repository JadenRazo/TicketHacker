import { IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class OverviewQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d' = '30d';
}

export class TrendsQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d' = '30d';

  @IsOptional()
  @IsIn(['day', 'week'])
  interval?: 'day' | 'week' = 'day';
}

export class AgentsQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d' = '30d';
}

export class TagsQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d' = '30d';

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
