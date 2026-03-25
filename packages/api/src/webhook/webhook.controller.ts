import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WebhookService } from './webhook.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { UpdateWebhookEndpointDto } from './dto/update-webhook-endpoint.dto';

@Controller('webhooks')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('ADMIN')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  createEndpoint(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateWebhookEndpointDto,
  ) {
    return this.webhookService.createEndpoint(tenantId, dto);
  }

  @Get()
  listEndpoints(@CurrentUser('tenantId') tenantId: string) {
    return this.webhookService.listEndpoints(tenantId);
  }

  @Patch(':id')
  updateEndpoint(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookEndpointDto,
  ) {
    return this.webhookService.updateEndpoint(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEndpoint(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.webhookService.deleteEndpoint(tenantId, id);
  }

  @Get(':id/deliveries')
  getDeliveries(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.webhookService.getDeliveries(tenantId, id, limit);
  }

  @Post('deliveries/:id/retry')
  @HttpCode(HttpStatus.NO_CONTENT)
  async retryDelivery(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.webhookService.retryDelivery(tenantId, id);
  }
}
