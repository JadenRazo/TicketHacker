import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationService } from './notification.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.notificationService.findAll(userId, tenantId, {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }

  @Get('unread-count')
  async getUnreadCount(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const count = await this.notificationService.getUnreadCount(userId, tenantId);
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Param('id') notificationId: string,
  ) {
    await this.notificationService.markAsRead(userId, notificationId);
    return { success: true };
  }

  @Post('mark-all-read')
  async markAllRead(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    await this.notificationService.markAllRead(userId, tenantId);
    return { success: true };
  }
}
