import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CannedResponseService } from './canned-response.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCannedResponseDto } from './dto/create-canned-response.dto';
import { UpdateCannedResponseDto } from './dto/update-canned-response.dto';

@Controller('canned-responses')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class CannedResponseController {
  constructor(private cannedResponseService: CannedResponseService) {}

  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCannedResponseDto,
  ) {
    return this.cannedResponseService.create(tenantId, userId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.cannedResponseService.findAll(tenantId, userId);
  }

  @Get('search')
  search(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Query('q') query: string,
  ) {
    return this.cannedResponseService.search(tenantId, userId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.cannedResponseService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCannedResponseDto,
  ) {
    return this.cannedResponseService.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.cannedResponseService.remove(tenantId, id);
  }
}
