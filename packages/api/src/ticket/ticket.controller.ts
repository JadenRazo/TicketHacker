import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TicketService } from './ticket.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketFiltersDto } from './dto/ticket-filters.dto';
import { BulkUpdateDto } from './dto/bulk-update.dto';
import { MergeTicketDto } from './dto/merge-ticket.dto';
import { SnoozeTicketDto } from './dto/snooze-ticket.dto';

@Controller('tickets')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() createTicketDto: CreateTicketDto,
  ) {
    return this.ticketService.create(tenantId, userId, createTicketDto);
  }

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() filters: TicketFiltersDto,
  ) {
    return this.ticketService.findAll(tenantId, filters);
  }

  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.ticketService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() updateTicketDto: UpdateTicketDto,
  ) {
    return this.ticketService.update(tenantId, id, updateTicketDto);
  }

  @Post(':id/snooze')
  snooze(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() snoozeDto: SnoozeTicketDto,
  ) {
    const until = snoozeDto.until ? new Date(snoozeDto.until) : null;
    return this.ticketService.snooze(tenantId, id, until);
  }

  @Post(':id/merge')
  merge(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') sourceId: string,
    @Body() mergeDto: MergeTicketDto,
  ) {
    return this.ticketService.merge(tenantId, sourceId, mergeDto.targetTicketId);
  }

  @Post('bulk')
  bulkUpdate(
    @CurrentUser('tenantId') tenantId: string,
    @Body() bulkUpdateDto: BulkUpdateDto,
  ) {
    return this.ticketService.bulkUpdate(tenantId, bulkUpdateDto);
  }
}
