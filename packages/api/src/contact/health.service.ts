import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthScoreFactor {
  score: number;
  detail: string;
}

export interface HealthScore {
  score: number;
  level: 'healthy' | 'at_risk' | 'critical';
  factors: {
    ticketVolume: HealthScoreFactor;
    resolutionTime: HealthScoreFactor;
    satisfaction: HealthScoreFactor;
    sentiment: HealthScoreFactor;
    recency: HealthScoreFactor;
  };
  lastUpdated: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async calculateHealthScore(
    tenantId: string,
    contactId: string,
  ): Promise<HealthScore> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Single batch query: fetch the contact and its recent tickets
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        tenantId: true,
        satisfactionRating: true,
        tickets: {
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: {
            id: true,
            status: true,
            createdAt: true,
            resolvedAt: true,
            metadata: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!contact || contact.tenantId !== tenantId) {
      // Return a neutral score for unknown contacts
      return this.buildHealthScore(20, 20, 0, 20, 20);
    }

    const recentTickets = contact.tickets;

    const ticketVolumeScore = this.scoreTicketVolume(recentTickets.length);
    const resolutionTimeScore = this.scoreResolutionTime(recentTickets);
    const satisfactionScore = this.scoreSatisfaction(
      contact.satisfactionRating,
      recentTickets,
    );
    const sentimentScore = this.scoreSentiment(recentTickets);
    const recencyScore = this.scoreRecency(recentTickets);

    const healthScore = this.buildHealthScore(
      ticketVolumeScore.score,
      resolutionTimeScore.score,
      satisfactionScore.score,
      sentimentScore.score,
      recencyScore.score,
      ticketVolumeScore.detail,
      resolutionTimeScore.detail,
      satisfactionScore.detail,
      sentimentScore.detail,
      recencyScore.detail,
    );

    return healthScore;
  }

  async calculateBatchHealthScores(
    tenantId: string,
    contactIds: string[],
  ): Promise<Map<string, HealthScore>> {
    if (contactIds.length === 0) return new Map();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds }, tenantId },
      select: {
        id: true,
        satisfactionRating: true,
        tickets: {
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: {
            id: true,
            status: true,
            createdAt: true,
            resolvedAt: true,
            metadata: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const result = new Map<string, HealthScore>();

    for (const contact of contacts) {
      const recentTickets = contact.tickets;

      const ticketVolumeScore = this.scoreTicketVolume(recentTickets.length);
      const resolutionTimeScore = this.scoreResolutionTime(recentTickets);
      const satisfactionScore = this.scoreSatisfaction(
        contact.satisfactionRating,
        recentTickets,
      );
      const sentimentScore = this.scoreSentiment(recentTickets);
      const recencyScore = this.scoreRecency(recentTickets);

      result.set(
        contact.id,
        this.buildHealthScore(
          ticketVolumeScore.score,
          resolutionTimeScore.score,
          satisfactionScore.score,
          sentimentScore.score,
          recencyScore.score,
          ticketVolumeScore.detail,
          resolutionTimeScore.detail,
          satisfactionScore.detail,
          sentimentScore.detail,
          recencyScore.detail,
        ),
      );
    }

    return result;
  }

  async getHealthSummary(
    tenantId: string,
  ): Promise<{
    total: number;
    healthy: number;
    atRisk: number;
    critical: number;
    avgScore: number;
  }> {
    // Get all contact IDs for the tenant
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId },
      select: { id: true },
    });

    if (contacts.length === 0) {
      return { total: 0, healthy: 0, atRisk: 0, critical: 0, avgScore: 0 };
    }

    const contactIds = contacts.map((c) => c.id);
    const scoresMap = await this.calculateBatchHealthScores(
      tenantId,
      contactIds,
    );

    let healthy = 0;
    let atRisk = 0;
    let critical = 0;
    let totalScore = 0;

    for (const score of scoresMap.values()) {
      totalScore += score.score;
      if (score.level === 'healthy') healthy++;
      else if (score.level === 'at_risk') atRisk++;
      else critical++;
    }

    const total = scoresMap.size;
    const avgScore = total > 0 ? Math.round(totalScore / total) : 0;

    return { total, healthy, atRisk, critical, avgScore };
  }

  // ---------------------------------------------------------------------------
  // Scoring factors (each 0-20 points)
  // ---------------------------------------------------------------------------

  private scoreTicketVolume(count: number): HealthScoreFactor {
    if (count === 0) return { score: 20, detail: 'No tickets in last 30 days' };
    if (count <= 2) return { score: 15, detail: `${count} ticket${count > 1 ? 's' : ''} in last 30 days` };
    if (count <= 5) return { score: 10, detail: `${count} tickets in last 30 days` };
    if (count <= 10) return { score: 5, detail: `${count} tickets in last 30 days` };
    return { score: 0, detail: `${count} tickets in last 30 days (high volume)` };
  }

  private scoreResolutionTime(
    tickets: Array<{ createdAt: Date; resolvedAt: Date | null }>,
  ): HealthScoreFactor {
    const resolved = tickets.filter((t) => t.resolvedAt);

    if (resolved.length === 0) {
      return { score: 10, detail: 'No resolved tickets to measure' };
    }

    const totalHours = resolved.reduce((sum, t) => {
      const diff =
        new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime();
      return sum + diff / 3_600_000;
    }, 0);

    const avgHours = totalHours / resolved.length;

    if (avgHours < 2) return { score: 20, detail: `Avg resolution ${avgHours.toFixed(1)}h (< 2h)` };
    if (avgHours < 8) return { score: 15, detail: `Avg resolution ${avgHours.toFixed(1)}h (< 8h)` };
    if (avgHours < 24) return { score: 10, detail: `Avg resolution ${avgHours.toFixed(1)}h (< 24h)` };
    if (avgHours < 72) return { score: 5, detail: `Avg resolution ${avgHours.toFixed(1)}h (< 72h)` };
    return { score: 0, detail: `Avg resolution ${avgHours.toFixed(1)}h (72h+)` };
  }

  private scoreSatisfaction(
    contactRating: number | null,
    tickets: Array<{ metadata: any }>,
  ): HealthScoreFactor {
    // First check the contact-level satisfaction rating
    if (contactRating !== null && contactRating !== undefined) {
      return this.satisfactionScoreFromRating(contactRating);
    }

    // Fall back to ticket metadata CSAT ratings
    const ratings = tickets
      .map((t) => {
        const meta = t.metadata as Record<string, any> | null;
        return meta?.csatRating ?? meta?.csat ?? null;
      })
      .filter((r): r is number => r !== null && typeof r === 'number');

    if (ratings.length === 0) {
      return { score: 0, detail: 'No satisfaction rating available' };
    }

    const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
    return this.satisfactionScoreFromRating(avg);
  }

  private satisfactionScoreFromRating(rating: number): HealthScoreFactor {
    const rounded = Math.round(rating);
    if (rounded >= 5) return { score: 20, detail: `${rating.toFixed(1)}/5 stars` };
    if (rounded === 4) return { score: 15, detail: `${rating.toFixed(1)}/5 stars` };
    if (rounded === 3) return { score: 10, detail: `${rating.toFixed(1)}/5 stars` };
    if (rounded === 2) return { score: 5, detail: `${rating.toFixed(1)}/5 stars` };
    return { score: 0, detail: `${rating.toFixed(1)}/5 stars` };
  }

  private scoreSentiment(
    tickets: Array<{ metadata: any }>,
  ): HealthScoreFactor {
    const sentiments: string[] = [];

    for (const ticket of tickets) {
      const meta = ticket.metadata as Record<string, any> | null;
      if (!meta) continue;

      // Check aiTriage for sentiment
      const triageSentiment =
        meta?.aiTriage?.sentiment ??
        meta?.aiActivityLog?.find((e: any) => e.sentiment)?.sentiment;

      if (triageSentiment) {
        sentiments.push(String(triageSentiment).toLowerCase());
      }
    }

    if (sentiments.length === 0) {
      return { score: 20, detail: 'No sentiment data available (assumed neutral)' };
    }

    const negativeKeywords = ['negative', 'frustrated', 'angry', 'upset', 'unhappy'];
    const positiveKeywords = ['positive', 'happy', 'satisfied', 'great', 'good'];

    const negativeCount = sentiments.filter((s) =>
      negativeKeywords.some((k) => s.includes(k)),
    ).length;
    const positiveCount = sentiments.filter((s) =>
      positiveKeywords.some((k) => s.includes(k)),
    ).length;

    const total = sentiments.length;
    const negativeRatio = negativeCount / total;

    if (negativeRatio > 0.5) {
      return { score: 0, detail: `Mostly negative sentiment (${negativeCount}/${total} tickets)` };
    }
    if (negativeRatio > 0) {
      return { score: 10, detail: `Mixed sentiment (${negativeCount} negative, ${positiveCount} positive)` };
    }
    return { score: 20, detail: `Positive/neutral sentiment across ${total} ticket${total > 1 ? 's' : ''}` };
  }

  private scoreRecency(
    tickets: Array<{ createdAt: Date }>,
  ): HealthScoreFactor {
    if (tickets.length === 0) {
      return { score: 20, detail: 'No tickets ever (new customer)' };
    }

    const mostRecent = tickets.reduce((latest, t) =>
      new Date(t.createdAt) > new Date(latest.createdAt) ? t : latest,
    );

    const now = new Date();
    const lastDate = new Date(mostRecent.createdAt);
    const diffMs = now.getTime() - lastDate.getTime();
    const diffDays = diffMs / 86_400_000;

    if (diffDays > 30) return { score: 20, detail: `Last ticket ${Math.round(diffDays)}d ago` };
    if (diffDays >= 7) return { score: 15, detail: `Last ticket ${Math.round(diffDays)}d ago` };
    if (diffDays >= 3) return { score: 10, detail: `Last ticket ${Math.round(diffDays)}d ago` };
    if (diffDays >= 1) return { score: 5, detail: `Last ticket ${Math.round(diffDays)}d ago` };
    return { score: 0, detail: 'Active ticket today' };
  }

  // ---------------------------------------------------------------------------
  // Assembly helpers
  // ---------------------------------------------------------------------------

  private buildHealthScore(
    ticketVolumeScore: number,
    resolutionTimeScore: number,
    satisfactionScore: number,
    sentimentScore: number,
    recencyScore: number,
    ticketVolumeDetail = '',
    resolutionTimeDetail = '',
    satisfactionDetail = '',
    sentimentDetail = '',
    recencyDetail = '',
  ): HealthScore {
    const total =
      ticketVolumeScore +
      resolutionTimeScore +
      satisfactionScore +
      sentimentScore +
      recencyScore;

    const level =
      total >= 70 ? 'healthy' : total >= 40 ? 'at_risk' : 'critical';

    return {
      score: total,
      level,
      factors: {
        ticketVolume: { score: ticketVolumeScore, detail: ticketVolumeDetail },
        resolutionTime: { score: resolutionTimeScore, detail: resolutionTimeDetail },
        satisfaction: { score: satisfactionScore, detail: satisfactionDetail },
        sentiment: { score: sentimentScore, detail: sentimentDetail },
        recency: { score: recencyScore, detail: recencyDetail },
      },
      lastUpdated: new Date().toISOString(),
    };
  }
}
