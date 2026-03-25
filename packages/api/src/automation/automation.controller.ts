import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AutomationService } from './automation.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';

@Controller('automations')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('ADMIN')
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateAutomationDto,
  ) {
    return this.automationService.create(tenantId, dto);
  }

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.automationService.findAll(tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.automationService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationDto,
  ) {
    return this.automationService.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.automationService.remove(tenantId, id);
  }
}
