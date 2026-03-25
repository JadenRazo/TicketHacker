import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MessageService } from './message.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageFiltersDto } from './dto/message-filters.dto';

@Controller('tickets/:ticketId/messages')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('ticketId') ticketId: string,
    @Body() createMessageDto: CreateMessageDto,
  ) {
    return this.messageService.create(tenantId, ticketId, userId, createMessageDto);
  }

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Param('ticketId') ticketId: string,
    @Query() filters: MessageFiltersDto,
  ) {
    return this.messageService.findAll(tenantId, ticketId, filters);
  }
}
