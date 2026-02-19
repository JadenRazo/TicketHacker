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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { KnowledgeBaseService } from './knowledge-base.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Agent-facing routes (JWT + AGENT role required)
// ---------------------------------------------------------------------------
@Controller('knowledge-base/articles')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateArticleDto,
  ) {
    return this.kbService.create(tenantId, userId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('status') status?: ArticleStatus,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.kbService.findAll(tenantId, { status, category, search });
  }

  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.kbService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.kbService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.kbService.remove(tenantId, id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.kbService.publish(tenantId, id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.kbService.archive(tenantId, id);
  }
}

// ---------------------------------------------------------------------------
// Public-facing routes (no auth, tenant-scoped via slug)
// ---------------------------------------------------------------------------
@Controller('knowledge-base/public')
export class KnowledgeBasePublicController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  @Get(':tenantSlug/articles')
  async listPublished(
    @Param('tenantSlug') tenantSlug: string,
    @Query('category') category?: string,
  ) {
    const tenant = await this.kbService.getTenantBySlug(tenantSlug);
    return this.kbService.findPublished(tenant.id, { category });
  }

  @Get(':tenantSlug/articles/:slug')
  async getPublishedArticle(
    @Param('tenantSlug') tenantSlug: string,
    @Param('slug') slug: string,
  ) {
    const tenant = await this.kbService.getTenantBySlug(tenantSlug);
    return this.kbService.findPublishedBySlug(tenant.id, slug);
  }

  @Post(':tenantSlug/articles/:slug/feedback')
  @HttpCode(HttpStatus.OK)
  async submitFeedback(
    @Param('tenantSlug') tenantSlug: string,
    @Param('slug') slug: string,
    @Body('helpful') helpful: boolean,
  ) {
    const tenant = await this.kbService.getTenantBySlug(tenantSlug);
    return this.kbService.submitFeedback(tenant.id, slug, helpful);
  }

  @Get(':tenantSlug/search')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async search(
    @Param('tenantSlug') tenantSlug: string,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    const tenant = await this.kbService.getTenantBySlug(tenantSlug);
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.kbService.searchArticles(
      tenant.id,
      query || '',
      isNaN(parsedLimit) ? 10 : parsedLimit,
    );
  }
}
