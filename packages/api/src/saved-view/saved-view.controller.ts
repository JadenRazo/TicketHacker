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
import { SavedViewService } from './saved-view.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { UpdateSavedViewDto } from './dto/update-saved-view.dto';

@Controller('saved-views')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class SavedViewController {
  constructor(private savedViewService: SavedViewService) {}

  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSavedViewDto,
  ) {
    return this.savedViewService.create(tenantId, userId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.savedViewService.findAll(tenantId, userId);
  }

  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSavedViewDto,
  ) {
    return this.savedViewService.update(tenantId, userId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.savedViewService.remove(tenantId, userId, id);
  }
}
