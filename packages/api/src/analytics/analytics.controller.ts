import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticsService } from './analytics.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  OverviewQueryDto,
  TrendsQueryDto,
  AgentsQueryDto,
  TagsQueryDto,
} from './dto/analytics-query.dto';

@Controller('analytics')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  getOverview(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: OverviewQueryDto,
  ) {
    return this.analyticsService.getOverview(tenantId, query.period ?? '30d');
  }

  @Get('trends')
  getTrends(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: TrendsQueryDto,
  ) {
    return this.analyticsService.getTrends(
      tenantId,
      query.period ?? '30d',
      query.interval ?? 'day',
    );
  }

  @Get('agents')
  getAgents(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: AgentsQueryDto,
  ) {
    return this.analyticsService.getAgents(tenantId, query.period ?? '30d');
  }

  @Get('tags')
  getTags(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: TagsQueryDto,
  ) {
    return this.analyticsService.getTags(
      tenantId,
      query.period ?? '30d',
      query.limit ?? 20,
    );
  }
}
