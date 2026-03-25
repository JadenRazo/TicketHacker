import {
  IsString,
  MaxLength,
  IsOptional,
  IsArray,
  IsEnum,
} from 'class-validator';
import { ArticleStatus } from '@prisma/client';

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;
}
