import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DiscordService } from './discord.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('discord')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
export class DiscordController {
  constructor(private discordService: DiscordService) {}

  @Post('setup')
  @Roles('ADMIN')
  async createSupportPanel(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { guildId: string; channelId: string },
  ) {
    return this.discordService.createSupportPanel(
      body.guildId,
      body.channelId,
      tenantId,
    );
  }

  @Get('status')
  @Roles('ADMIN')
  getStatus() {
    return this.discordService.getStatus();
  }
}
