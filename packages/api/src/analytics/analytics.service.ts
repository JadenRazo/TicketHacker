import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

type Period = '7d' | '30d' | '90d';
type Interval = 'day' | 'week';

function periodToDays(period: Period): number {
  const map: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90 };
  return map[period];
}

function periodStart(period: Period): Date {
  const days = periodToDays(period);
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId: string, period: Period = '30d') {
    const since = periodStart(period);

    // Ticket volume by status
    const volumeGroups = await this.prisma.ticket.groupBy({
      by: ['status'],
      where: { tenantId, createdAt: { gte: since } },
      _count: { id: true },
    });

    const ticketVolume = {
      total: 0,
      open: 0,
      pending: 0,
      resolved: 0,
      closed: 0,
    };

    for (const g of volumeGroups) {
      const count = g._count.id;
      ticketVolume.total += count;
      const key = g.status.toLowerCase() as keyof typeof ticketVolume;
      if (key in ticketVolume) ticketVolume[key] = count;
    }

    // Average resolution time in hours for resolved/closed tickets
    const resolutionResult = await this.prisma.$queryRaw<
      Array<{ avg_hours: number | null }>
    >(
      Prisma.sql`
        SELECT AVG(
          EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600
        ) AS avg_hours
        FROM "Ticket"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${since}
          AND "resolvedAt" IS NOT NULL
          AND status IN ('RESOLVED', 'CLOSED')
      `,
    );
    const avgResolutionTimeHours =
      Number(resolutionResult[0]?.avg_hours ?? 0) || 0;

    // Average first response time in minutes
    // For each ticket, the earliest OUTBOUND message that isn't SYSTEM type
    const firstResponseResult = await this.prisma.$queryRaw<
      Array<{ avg_minutes: number | null }>
    >(
      Prisma.sql`
        SELECT AVG(
          EXTRACT(EPOCH FROM (m."createdAt" - t."createdAt")) / 60
        ) AS avg_minutes
        FROM "Ticket" t
        INNER JOIN LATERAL (
          SELECT "createdAt"
          FROM "Message"
          WHERE "ticketId" = t.id
            AND direction = 'OUTBOUND'
            AND "messageType" != 'SYSTEM'
          ORDER BY "createdAt" ASC
          LIMIT 1
        ) m ON true
        WHERE t."tenantId" = ${tenantId}
          AND t."createdAt" >= ${since}
      `,
    );
    const avgFirstResponseTimeMinutes =
      Number(firstResponseResult[0]?.avg_minutes ?? 0) || 0;

    // SLA compliance rate: tickets where resolvedAt < slaDeadline / total with slaDeadline
    const slaResult = await this.prisma.$queryRaw<
      Array<{ compliant: bigint; total: bigint }>
    >(
      Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" < "slaDeadline") AS compliant,
          COUNT(*) AS total
        FROM "Ticket"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${since}
          AND "slaDeadline" IS NOT NULL
      `,
    );
    const slaTotal = Number(slaResult[0]?.total ?? 0);
    const slaCompliant = Number(slaResult[0]?.compliant ?? 0);
    const slaComplianceRate = slaTotal > 0 ? slaCompliant / slaTotal : 1;

    // CSAT average from contact satisfactionRating linked to tickets in period
    const csatResult = await this.prisma.$queryRaw<
      Array<{ avg_csat: number | null }>
    >(
      Prisma.sql`
        SELECT AVG(c."satisfactionRating"::float) AS avg_csat
        FROM "Ticket" t
        INNER JOIN "Contact" c ON c.id = t."contactId"
        WHERE t."tenantId" = ${tenantId}
          AND t."createdAt" >= ${since}
          AND c."satisfactionRating" IS NOT NULL
      `,
    );
    const csatAverage = Number(csatResult[0]?.avg_csat ?? 0) || 0;

    // Tickets by channel
    const channelGroups = await this.prisma.ticket.groupBy({
      by: ['channel'],
      where: { tenantId, createdAt: { gte: since } },
      _count: { id: true },
    });

    const ticketsByChannel: Record<string, number> = {};
    for (const g of channelGroups) {
      ticketsByChannel[g.channel] = g._count.id;
    }

    // Tickets by priority
    const priorityGroups = await this.prisma.ticket.groupBy({
      by: ['priority'],
      where: { tenantId, createdAt: { gte: since } },
      _count: { id: true },
    });

    const ticketsByPriority: Record<string, number> = {};
    for (const g of priorityGroups) {
      ticketsByPriority[g.priority] = g._count.id;
    }

    return {
      ticketVolume,
      avgResolutionTimeHours: Math.round(avgResolutionTimeHours * 10) / 10,
      avgFirstResponseTimeMinutes:
        Math.round(avgFirstResponseTimeMinutes * 10) / 10,
      slaComplianceRate: Math.round(slaComplianceRate * 1000) / 1000,
      csatAverage: Math.round(csatAverage * 100) / 100,
      ticketsByChannel,
      ticketsByPriority,
    };
  }

  async getTrends(
    tenantId: string,
    period: Period = '30d',
    interval: Interval = 'day',
  ) {
    const since = periodStart(period);
    const truncUnit = interval === 'week' ? 'week' : 'day';

    const createdRows = await this.prisma.$queryRaw<
      Array<{ bucket: Date; count: bigint }>
    >(
      Prisma.sql`
        SELECT date_trunc(${truncUnit}, "createdAt") AS bucket, COUNT(*) AS count
        FROM "Ticket"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${since}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    );

    const resolvedRows = await this.prisma.$queryRaw<
      Array<{ bucket: Date; count: bigint }>
    >(
      Prisma.sql`
        SELECT date_trunc(${truncUnit}, "resolvedAt") AS bucket, COUNT(*) AS count
        FROM "Ticket"
        WHERE "tenantId" = ${tenantId}
          AND "resolvedAt" IS NOT NULL
          AND "resolvedAt" >= ${since}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    );

    const resolutionHoursRows = await this.prisma.$queryRaw<
      Array<{ bucket: Date; avg_hours: number | null }>
    >(
      Prisma.sql`
        SELECT
          date_trunc(${truncUnit}, "resolvedAt") AS bucket,
          AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600) AS avg_hours
        FROM "Ticket"
        WHERE "tenantId" = ${tenantId}
          AND "resolvedAt" IS NOT NULL
          AND "resolvedAt" >= ${since}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    );

    // Build unified label set from all buckets
    const allBuckets = new Set<string>();
    for (const r of [...createdRows, ...resolvedRows]) {
      allBuckets.add(r.bucket.toISOString().substring(0, 10));
    }

    const labels = Array.from(allBuckets).sort();

    const createdMap = new Map<string, number>();
    for (const r of createdRows) {
      createdMap.set(
        r.bucket.toISOString().substring(0, 10),
        Number(r.count),
      );
    }

    const resolvedMap = new Map<string, number>();
    for (const r of resolvedRows) {
      resolvedMap.set(
        r.bucket.toISOString().substring(0, 10),
        Number(r.count),
      );
    }

    const hoursMap = new Map<string, number>();
    for (const r of resolutionHoursRows) {
      hoursMap.set(
        r.bucket.toISOString().substring(0, 10),
        Math.round(Number(r.avg_hours ?? 0) * 10) / 10,
      );
    }

    return {
      labels,
      created: labels.map((l) => createdMap.get(l) ?? 0),
      resolved: labels.map((l) => resolvedMap.get(l) ?? 0),
      avgResolutionHours: labels.map((l) => hoursMap.get(l) ?? 0),
    };
  }

  async getAgents(tenantId: string, period: Period = '30d') {
    const since = periodStart(period);

    // All users in tenant
    const users = await this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
    });

    if (users.length === 0) {
      return { agents: [] };
    }

    // Tickets assigned per agent in period
    const assignedGroups = await this.prisma.ticket.groupBy({
      by: ['assigneeId'],
      where: {
        tenantId,
        createdAt: { gte: since },
        assigneeId: { not: null },
      },
      _count: { id: true },
    });

    const assignedMap = new Map<string, number>();
    for (const g of assignedGroups) {
      if (g.assigneeId) assignedMap.set(g.assigneeId, g._count.id);
    }

    // Tickets resolved per agent in period
    const resolvedGroups = await this.prisma.ticket.groupBy({
      by: ['assigneeId'],
      where: {
        tenantId,
        resolvedAt: { gte: since },
        assigneeId: { not: null },
        status: { in: ['RESOLVED', 'CLOSED'] },
      },
      _count: { id: true },
    });

    const resolvedMap = new Map<string, number>();
    for (const g of resolvedGroups) {
      if (g.assigneeId) resolvedMap.set(g.assigneeId, g._count.id);
    }

    // Avg resolution hours per agent
    const avgResolutionRows = await this.prisma.$queryRaw<
      Array<{ assignee_id: string; avg_hours: number | null }>
    >(
      Prisma.sql`
        SELECT
          "assigneeId" AS assignee_id,
          AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600) AS avg_hours
        FROM "Ticket"
        WHERE "tenantId" = ${tenantId}
          AND "resolvedAt" IS NOT NULL
          AND "resolvedAt" >= ${since}
          AND "assigneeId" IS NOT NULL
          AND status IN ('RESOLVED', 'CLOSED')
        GROUP BY "assigneeId"
      `,
    );

    const avgResolutionMap = new Map<string, number>();
    for (const r of avgResolutionRows) {
      avgResolutionMap.set(
        r.assignee_id,
        Math.round(Number(r.avg_hours ?? 0) * 10) / 10,
      );
    }

    // Avg first response minutes per agent (first outbound message per ticket)
    const avgFirstResponseRows = await this.prisma.$queryRaw<
      Array<{ assignee_id: string; avg_minutes: number | null }>
    >(
      Prisma.sql`
        SELECT
          t."assigneeId" AS assignee_id,
          AVG(EXTRACT(EPOCH FROM (m."createdAt" - t."createdAt")) / 60) AS avg_minutes
        FROM "Ticket" t
        INNER JOIN LATERAL (
          SELECT "createdAt"
          FROM "Message"
          WHERE "ticketId" = t.id
            AND direction = 'OUTBOUND'
            AND "messageType" != 'SYSTEM'
          ORDER BY "createdAt" ASC
          LIMIT 1
        ) m ON true
        WHERE t."tenantId" = ${tenantId}
          AND t."createdAt" >= ${since}
          AND t."assigneeId" IS NOT NULL
        GROUP BY t."assigneeId"
      `,
    );

    const avgFirstResponseMap = new Map<string, number>();
    for (const r of avgFirstResponseRows) {
      avgFirstResponseMap.set(
        r.assignee_id,
        Math.round(Number(r.avg_minutes ?? 0) * 10) / 10,
      );
    }

    const agents = users.map((u) => ({
      id: u.id,
      name: u.name,
      ticketsAssigned: assignedMap.get(u.id) ?? 0,
      ticketsResolved: resolvedMap.get(u.id) ?? 0,
      avgResolutionHours: avgResolutionMap.get(u.id) ?? 0,
      avgFirstResponseMinutes: avgFirstResponseMap.get(u.id) ?? 0,
    }));

    // Sort by tickets resolved descending
    agents.sort((a, b) => b.ticketsResolved - a.ticketsResolved);

    return { agents };
  }

  async getTags(tenantId: string, period: Period = '30d', limit = 20) {
    const since = periodStart(period);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const rows = await this.prisma.$queryRaw<
      Array<{ tag: string; count: bigint }>
    >(
      Prisma.sql`
        SELECT unnest(tags) AS tag, COUNT(*) AS count
        FROM "Ticket"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${since}
          AND array_length(tags, 1) > 0
        GROUP BY tag
        ORDER BY count DESC
        LIMIT ${safeLimit}
      `,
    );

    return {
      tags: rows.map((r) => ({ tag: r.tag, count: Number(r.count) })),
    };
  }
}
