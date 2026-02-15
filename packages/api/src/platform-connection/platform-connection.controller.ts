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
import { PlatformConnectionService } from './platform-connection.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePlatformConnectionDto } from './dto/create-platform-connection.dto';
import { UpdatePlatformConnectionDto } from './dto/update-platform-connection.dto';

@Controller('platform-connections')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('ADMIN')
export class PlatformConnectionController {
  constructor(private platformConnectionService: PlatformConnectionService) {}

  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreatePlatformConnectionDto,
  ) {
    return this.platformConnectionService.create(tenantId, dto);
  }

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.platformConnectionService.findAll(tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.platformConnectionService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformConnectionDto,
  ) {
    return this.platformConnectionService.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.platformConnectionService.remove(tenantId, id);
  }
}
