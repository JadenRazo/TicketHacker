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
import { MacroService } from './macro.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateMacroDto } from './dto/create-macro.dto';
import { UpdateMacroDto } from './dto/update-macro.dto';
import { ExecuteMacroDto } from './dto/execute-macro.dto';

@Controller('macros')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class MacroController {
  constructor(private macroService: MacroService) {}

  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateMacroDto,
  ) {
    return this.macroService.create(tenantId, userId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.macroService.findAll(tenantId, userId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.macroService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMacroDto,
  ) {
    return this.macroService.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.macroService.remove(tenantId, id);
  }

  @Post(':id/execute')
  execute(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ExecuteMacroDto,
  ) {
    return this.macroService.execute(tenantId, userId, id, dto.ticketId);
  }
}
