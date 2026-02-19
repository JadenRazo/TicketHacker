import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleStatus } from '@prisma/client';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class KnowledgeBaseService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRaw`
        ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS embedding vector(1536)
      `;
      await this.prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS article_embedding_idx ON "Article"
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
      `;
    } catch (e) {
      // Column may already exist or pgvector not available
      this.logger.warn('Could not set up vector column for articles', e);
    }
  }

  // -------------------------------------------------------------------------
  // Agent-facing CRUD
  // -------------------------------------------------------------------------

  async create(tenantId: string, authorId: string, dto: CreateArticleDto) {
    const baseSlug = slugify(dto.title);
    const slug = await this.resolveUniqueSlug(tenantId, baseSlug);

    const article = await this.prisma.article.create({
      data: {
        tenantId,
        title: dto.title,
        content: dto.content,
        slug,
        category: dto.category ?? null,
        tags: dto.tags ?? [],
        status: dto.status ?? ArticleStatus.DRAFT,
        authorId,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    // Fire-and-forget embedding generation - failures don't block the response
    this.generateAndStoreEmbedding(article.id, dto.title, dto.content).catch(
      () => {
        // Already logged inside the method
      },
    );

    return article;
  }

  async findAll(
    tenantId: string,
    params?: { status?: ArticleStatus; category?: string; search?: string },
  ) {
    return this.prisma.article.findMany({
      where: {
        tenantId,
        ...(params?.status && { status: params.status }),
        ...(params?.category && {
          category: { equals: params.category, mode: 'insensitive' },
        }),
        ...(params?.search && {
          OR: [
            { title: { contains: params.search, mode: 'insensitive' } },
            { content: { contains: params.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    if (!article || article.tenantId !== tenantId) {
      throw new NotFoundException('Article not found');
    }

    return article;
  }

  async update(tenantId: string, id: string, dto: UpdateArticleDto) {
    const existing = await this.prisma.article.findUnique({ where: { id } });

    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Article not found');
    }

    const updates: Record<string, unknown> = {};

    if (dto.title !== undefined) {
      updates.title = dto.title;
      // Regenerate slug only when title changes
      const baseSlug = slugify(dto.title);
      updates.slug = await this.resolveUniqueSlug(tenantId, baseSlug, id);
    }
    if (dto.content !== undefined) updates.content = dto.content;
    if (dto.category !== undefined) updates.category = dto.category;
    if (dto.tags !== undefined) updates.tags = dto.tags;
    if (dto.status !== undefined) updates.status = dto.status;

    const article = await this.prisma.article.update({
      where: { id },
      data: updates,
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    // Regenerate embedding when title or content changes
    const newTitle = (dto.title ?? existing.title) as string;
    const newContent = (dto.content ?? existing.content) as string;
    if (dto.title !== undefined || dto.content !== undefined) {
      this.generateAndStoreEmbedding(id, newTitle, newContent).catch(() => {
        // Already logged inside the method
      });
    }

    return article;
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.article.findUnique({ where: { id } });

    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Article not found');
    }

    await this.prisma.article.delete({ where: { id } });
    return { message: 'Article deleted successfully' };
  }

  async publish(tenantId: string, id: string) {
    return this.setStatus(tenantId, id, ArticleStatus.PUBLISHED);
  }

  async archive(tenantId: string, id: string) {
    return this.setStatus(tenantId, id, ArticleStatus.ARCHIVED);
  }

  // -------------------------------------------------------------------------
  // Public-facing reads
  // -------------------------------------------------------------------------

  async getTenantBySlug(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async findPublished(tenantId: string, params?: { category?: string }) {
    return this.prisma.article.findMany({
      where: {
        tenantId,
        status: ArticleStatus.PUBLISHED,
        ...(params?.category && {
          category: { equals: params.category, mode: 'insensitive' },
        }),
      },
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        tags: true,
        viewCount: true,
        helpfulCount: true,
        notHelpfulCount: true,
        updatedAt: true,
      },
      orderBy: { viewCount: 'desc' },
    });
  }

  async findPublishedBySlug(tenantId: string, slug: string) {
    const article = await this.prisma.article.findUnique({
      where: { tenantId_slug: { tenantId, slug } },
      select: {
        id: true,
        title: true,
        content: true,
        slug: true,
        category: true,
        tags: true,
        viewCount: true,
        helpfulCount: true,
        notHelpfulCount: true,
        status: true,
        updatedAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    if (!article || article.status !== ArticleStatus.PUBLISHED) {
      throw new NotFoundException('Article not found');
    }

    // Increment view count asynchronously - don't block the response
    this.prisma.article
      .update({
        where: { tenantId_slug: { tenantId, slug } },
        data: { viewCount: { increment: 1 } },
      })
      .catch((err) => {
        this.logger.warn('Failed to increment view count', err);
      });

    return article;
  }

  async submitFeedback(
    tenantId: string,
    slug: string,
    helpful: boolean,
  ) {
    const article = await this.prisma.article.findUnique({
      where: { tenantId_slug: { tenantId, slug } },
    });

    if (!article || article.status !== ArticleStatus.PUBLISHED) {
      throw new NotFoundException('Article not found');
    }

    await this.prisma.article.update({
      where: { id: article.id },
      data: helpful
        ? { helpfulCount: { increment: 1 } }
        : { notHelpfulCount: { increment: 1 } },
    });

    return { message: 'Feedback recorded' };
  }

  async searchArticles(tenantId: string, query: string, limit = 10) {
    try {
      const embedding = await this.aiService.generateEmbedding(query);

      if (!embedding) {
        throw new Error('Embedding generation returned null');
      }

      // pgvector cosine similarity search - lower distance = more similar
      const results = await this.prisma.$queryRaw<
        Array<{
          id: string;
          title: string;
          content: string;
          slug: string;
          category: string | null;
          tags: string[];
          viewCount: number;
          similarity: number;
        }>
      >`
        SELECT id, title, content, slug, category, tags, "viewCount",
               1 - (embedding <=> ${embedding}::vector) as similarity
        FROM "Article"
        WHERE "tenantId" = ${tenantId}
          AND status = 'PUBLISHED'
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embedding}::vector
        LIMIT ${limit}
      `;

      return results;
    } catch (e) {
      this.logger.warn(
        'Vector search failed, falling back to text search',
        e instanceof Error ? e.message : String(e),
      );

      // Fallback: plain text search ordered by view popularity
      return this.prisma.article.findMany({
        where: {
          tenantId,
          status: ArticleStatus.PUBLISHED,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          title: true,
          content: true,
          slug: true,
          category: true,
          tags: true,
          viewCount: true,
        },
        take: limit,
        orderBy: { viewCount: 'desc' },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async setStatus(
    tenantId: string,
    id: string,
    status: ArticleStatus,
  ) {
    const existing = await this.prisma.article.findUnique({ where: { id } });

    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Article not found');
    }

    return this.prisma.article.update({
      where: { id },
      data: { status },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  private async resolveUniqueSlug(
    tenantId: string,
    baseSlug: string,
    excludeId?: string,
  ): Promise<string> {
    let candidate = baseSlug;
    let counter = 1;

    while (true) {
      const conflict = await this.prisma.article.findUnique({
        where: { tenantId_slug: { tenantId, slug: candidate } },
      });

      if (!conflict || conflict.id === excludeId) {
        return candidate;
      }

      candidate = `${baseSlug}-${counter}`;
      counter++;
    }
  }

  private async generateAndStoreEmbedding(
    articleId: string,
    title: string,
    content: string,
  ): Promise<void> {
    try {
      const embedding = await this.aiService.generateEmbedding(
        `${title} ${content}`,
      );

      if (!embedding) return;

      await this.prisma.$executeRaw`
        UPDATE "Article" SET embedding = ${embedding}::vector
        WHERE id = ${articleId}
      `;
    } catch (e) {
      this.logger.warn(
        `Failed to generate/store embedding for article ${articleId}`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
}
