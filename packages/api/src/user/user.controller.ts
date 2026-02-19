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
import { UserService } from './user.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Controller('users')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Post('invite')
  @Roles('ADMIN')
  inviteUser(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: InviteUserDto,
  ) {
    return this.userService.inviteUser(tenantId, dto);
  }

  @Get()
  getUsers(
    @CurrentUser('tenantId') tenantId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.userService.findAll(tenantId, cursor, limit);
  }

  @Patch('me')
  updateCurrentUser(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.update(tenantId, userId, { name: dto.name });
  }

  @Get(':id')
  getUser(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') userId: string,
  ) {
    return this.userService.findOne(tenantId, userId);
  }

  @Patch(':id')
  @Roles('ADMIN')
  updateUser(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.update(tenantId, userId, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  deleteUser(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') userId: string,
  ) {
    return this.userService.deactivate(tenantId, userId);
  }

  @Patch('me/preferences')
  updatePreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.userService.updatePreferences(userId, dto);
  }
}
