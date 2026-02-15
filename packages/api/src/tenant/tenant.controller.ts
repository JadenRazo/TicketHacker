import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantService } from './tenant.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('tenant')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
export class TenantController {
  constructor(private tenantService: TenantService) {}

  @Get()
  getTenant(@CurrentUser('tenantId') tenantId: string) {
    return this.tenantService.getTenant(tenantId);
  }

  @Patch()
  @Roles('ADMIN')
  updateTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantService.updateTenant(tenantId, dto);
  }
}
