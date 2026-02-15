import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContactService } from './contact.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ContactFiltersDto } from './dto/contact-filters.dto';

@Controller('contacts')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class ContactController {
  constructor(private contactService: ContactService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() filters: ContactFiltersDto,
  ) {
    return this.contactService.findAll(
      tenantId,
      filters.search,
      filters.cursor,
      filters.limit,
    );
  }

  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.contactService.findOne(tenantId, id);
  }
}
