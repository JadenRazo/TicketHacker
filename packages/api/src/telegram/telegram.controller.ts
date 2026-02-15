import { Controller, Post, Delete, Get, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TelegramService } from './telegram.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('telegram')
export class TelegramController {
  constructor(private telegramService: TelegramService) {}

  @Post('setup')
  @UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
  @Roles('ADMIN')
  async registerBot(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { botToken: string },
  ) {
    return this.telegramService.registerBot(tenantId, body.botToken);
  }

  @Post('webhook/:tenantId')
  async handleWebhook(
    @Param('tenantId') tenantId: string,
    @Body() update: any,
  ) {
    await this.telegramService.handleWebhook(tenantId, update);
    return { ok: true };
  }

  @Delete('remove')
  @UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
  @Roles('ADMIN')
  async removeBot(@CurrentUser('tenantId') tenantId: string) {
    return this.telegramService.removeBot(tenantId);
  }

  @Get('status')
  @UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
  @Roles('ADMIN')
  async getStatus(@CurrentUser('tenantId') tenantId: string) {
    return this.telegramService.getAllBotStatuses(tenantId);
  }
}
