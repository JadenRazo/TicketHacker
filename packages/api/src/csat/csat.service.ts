import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RatingWithRelations {
  id: string;
  tenantId: string;
  ticketId: string;
  contactId: string | null;
  rating: number;
  comment: string | null;
  createdAt: Date;
  ticket: {
    subject: string;
    contact: {
      name: string | null;
      email: string | null;
    } | null;
  };
}

export interface TrendPoint {
  date: string;
  average: number;
  count: number;
}

@Injectable()
export class CsatService {
  private readonly logger = new Logger(CsatService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Derive a cutoff date from a period string like "7d", "30d", "90d".
   * Defaults to 30 days when the format is unrecognised.
   */
  private parsePeriodStart(period: string): Date {
    const days = parseInt(period.replace('d', ''), 10);
    const since = new Date();
    since.setDate(since.getDate() - (isNaN(days) ? 30 : days));
    return since;
  }

  async getRatings(tenantId: string, period = '30d'): Promise<RatingWithRelations[]> {
    const since = this.parsePeriodStart(period);

    return this.prisma.ticketRating.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
      },
      include: {
        ticket: {
          select: {
            subject: true,
            contact: {
              select: { name: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }) as unknown as RatingWithRelations[];
  }

  async getSummary(tenantId: string, period = '30d') {
    const since = this.parsePeriodStart(period);

    const ratings = await this.prisma.ticketRating.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
      },
      select: { rating: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (ratings.length === 0) {
      return {
        average: 0,
        total: 0,
        distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        trend: [],
      };
    }

    const total = ratings.length;
    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    const average = Math.round((sum / total) * 10) / 10;

    const distribution: Record<string, number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    for (const r of ratings) {
      const key = String(r.rating);
      distribution[key] = (distribution[key] ?? 0) + 1;
    }

    // Group ratings by calendar day to build the trend array
    const byDay = new Map<string, { sum: number; count: number }>();
    for (const r of ratings) {
      const day = r.createdAt.toISOString().slice(0, 10);
      const existing = byDay.get(day) ?? { sum: 0, count: 0 };
      existing.sum += r.rating;
      existing.count += 1;
      byDay.set(day, existing);
    }

    const trend: TrendPoint[] = Array.from(byDay.entries()).map(([date, data]) => ({
      date,
      average: Math.round((data.sum / data.count) * 10) / 10,
      count: data.count,
    }));

    return { average, total, distribution, trend };
  }

  async getRatingByTicket(tenantId: string, ticketId: string) {
    // Verify the ticket belongs to this tenant before returning its rating
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { tenantId: true },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    const rating = await this.prisma.ticketRating.findUnique({
      where: { ticketId },
    });

    return rating ?? null;
  }
}
