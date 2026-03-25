import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RoutingService } from './routing.service';
import { UpdateRoutingConfigDto } from './dto/routing-config.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('routing')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class RoutingController {
  constructor(
    private readonly routingService: RoutingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('config')
  async getConfig(@CurrentUser('tenantId') tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const settings = (tenant?.settings as Record<string, any>) ?? {};

    return {
      routingEnabled: settings.routingEnabled ?? false,
      routingRules: settings.routingRules ?? [],
    };
  }

  @Patch('config')
  @Roles('ADMIN')
  async updateConfig(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: UpdateRoutingConfigDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const existingSettings = (tenant?.settings as Record<string, any>) ?? {};

    const newSettings: Record<string, any> = {
      ...existingSettings,
      ...(dto.routingEnabled !== undefined && {
        routingEnabled: dto.routingEnabled,
      }),
      ...(dto.routingRules !== undefined && {
        routingRules: dto.routingRules,
      }),
    };

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: newSettings as any },
      select: { settings: true },
    });

    const settings = (updated.settings as Record<string, any>) ?? {};

    return {
      routingEnabled: settings.routingEnabled ?? false,
      routingRules: settings.routingRules ?? [],
    };
  }

  @Get('agents')
  @Roles('AGENT')
  async getAgents(@CurrentUser('tenantId') tenantId: string) {
    return this.routingService.getAgentLoads(tenantId);
  }
}
