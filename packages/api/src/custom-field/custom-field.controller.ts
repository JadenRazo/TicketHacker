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
import { CustomFieldService } from './custom-field.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

@Controller('custom-fields')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('ADMIN')
export class CustomFieldController {
  constructor(private customFieldService: CustomFieldService) {}

  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateCustomFieldDto,
  ) {
    return this.customFieldService.create(tenantId, dto);
  }

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.customFieldService.findAll(tenantId);
  }

  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    return this.customFieldService.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.customFieldService.remove(tenantId, id);
  }
}
