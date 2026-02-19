import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CsatService } from './csat.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('csat')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class CsatController {
  constructor(private readonly csatService: CsatService) {}

  /**
   * GET /csat/ratings?period=30d
   * Returns all ratings for the tenant within the period, including ticket and
   * contact details.
   */
  @Get('ratings')
  getRatings(
    @CurrentUser('tenantId') tenantId: string,
    @Query('period') period?: string,
  ) {
    return this.csatService.getRatings(tenantId, period ?? '30d');
  }

  /**
   * GET /csat/summary?period=30d
   * Returns aggregate CSAT data: average, total, distribution, and daily trend.
   */
  @Get('summary')
  getSummary(
    @CurrentUser('tenantId') tenantId: string,
    @Query('period') period?: string,
  ) {
    return this.csatService.getSummary(tenantId, period ?? '30d');
  }

  /**
   * GET /csat/ratings/:ticketId
   * Returns the rating record for a specific ticket (null if none exists yet).
   */
  @Get('ratings/:ticketId')
  getRatingByTicket(
    @CurrentUser('tenantId') tenantId: string,
    @Param('ticketId') ticketId: string,
  ) {
    return this.csatService.getRatingByTicket(tenantId, ticketId);
  }
}
