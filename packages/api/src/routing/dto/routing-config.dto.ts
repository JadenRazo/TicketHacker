import {
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  IsString,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

class RoutingConditionsDto {
  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

class RoutingRuleDto {
  @ValidateNested()
  @Type(() => RoutingConditionsDto)
  conditions: RoutingConditionsDto;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;
}

export class UpdateRoutingConfigDto {
  @IsOptional()
  @IsBoolean()
  routingEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingRuleDto)
  routingRules?: RoutingRuleDto[];
}
