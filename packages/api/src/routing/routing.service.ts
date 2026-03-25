import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RoutingRule {
  conditions: {
    channel?: string;
    priority?: string;
    tags?: string[];
  };
  teamId?: string;
  assigneeId?: string;
}

export interface RoutingAssignment {
  assigneeId?: string;
  teamId?: string;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load-balanced round-robin: assigns to the active agent with the fewest
   * open or pending tickets. Optionally scoped to a specific team.
   */
  async assignRoundRobin(
    tenantId: string,
    teamId?: string,
  ): Promise<string | null> {
    let userWhere: any = {
      tenantId,
      isActive: true,
      role: { in: ['AGENT', 'ADMIN'] },
    };

    if (teamId) {
      const teamMembers = await this.prisma.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      });

      const memberIds = teamMembers.map((m) => m.userId);
      if (memberIds.length === 0) return null;

      userWhere.id = { in: memberIds };
    }

    const agents = await this.prisma.user.findMany({
      where: userWhere,
      select: { id: true },
    });

    if (agents.length === 0) return null;

    // Count open + pending tickets per agent in a single query
    const ticketCounts = await this.prisma.ticket.groupBy({
      by: ['assigneeId'],
      where: {
        tenantId,
        assigneeId: { in: agents.map((a) => a.id) },
        status: { in: ['OPEN', 'PENDING'] },
      },
      _count: { id: true },
    });

    const countMap = new Map<string, number>();
    for (const row of ticketCounts) {
      if (row.assigneeId) {
        countMap.set(row.assigneeId, row._count.id);
      }
    }

    let minLoad = Infinity;
    let selected: string | null = null;

    for (const agent of agents) {
      const load = countMap.get(agent.id) ?? 0;
      if (load < minLoad) {
        minLoad = load;
        selected = agent.id;
      }
    }

    return selected;
  }

  /**
   * Evaluates tenant routing rules against the ticket. Returns the first
   * matching rule's assignment, or null if no rule matches.
   */
  async assignBySkill(
    tenantId: string,
    ticket: any,
  ): Promise<RoutingAssignment | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const settings = tenant?.settings as Record<string, any> | null;
    const rules: RoutingRule[] = settings?.routingRules ?? [];

    if (!rules || rules.length === 0) return null;

    for (const rule of rules) {
      if (this.matchesRule(ticket, rule)) {
        const assignment: RoutingAssignment = {};
        if (rule.teamId) assignment.teamId = rule.teamId;
        if (rule.assigneeId) assignment.assigneeId = rule.assigneeId;

        if (assignment.teamId || assignment.assigneeId) {
          this.logger.log(
            `Routing rule matched ticket ${ticket.id}: teamId=${assignment.teamId ?? 'none'}, assigneeId=${assignment.assigneeId ?? 'none'}`,
          );
          return assignment;
        }
      }
    }

    return null;
  }

  /**
   * Full auto-assignment flow:
   * 1. Attempt skill-based routing (rule match)
   * 2. Fall back to round-robin within the matched team, or globally
   */
  async autoAssign(
    tenantId: string,
    ticket: any,
  ): Promise<RoutingAssignment> {
    const skillResult = await this.assignBySkill(tenantId, ticket);

    if (skillResult) {
      // If the rule specified an explicit agent, we're done
      if (skillResult.assigneeId) {
        return skillResult;
      }

      // Rule matched a team — pick the least-loaded agent within that team
      const assigneeId = await this.assignRoundRobin(
        tenantId,
        skillResult.teamId,
      );

      return {
        teamId: skillResult.teamId,
        ...(assigneeId ? { assigneeId } : {}),
      };
    }

    // No skill match — global round-robin
    const assigneeId = await this.assignRoundRobin(tenantId);
    return assigneeId ? { assigneeId } : {};
  }

  /**
   * Returns all active agents with their current open/pending ticket counts.
   */
  async getAgentLoads(tenantId: string): Promise<
    Array<{ id: string; name: string; email: string; openTickets: number }>
  > {
    const agents = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: { in: ['AGENT', 'ADMIN'] },
      },
      select: { id: true, name: true, email: true },
    });

    if (agents.length === 0) return [];

    const ticketCounts = await this.prisma.ticket.groupBy({
      by: ['assigneeId'],
      where: {
        tenantId,
        assigneeId: { in: agents.map((a) => a.id) },
        status: { in: ['OPEN', 'PENDING'] },
      },
      _count: { id: true },
    });

    const countMap = new Map<string, number>();
    for (const row of ticketCounts) {
      if (row.assigneeId) countMap.set(row.assigneeId, row._count.id);
    }

    return agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      openTickets: countMap.get(agent.id) ?? 0,
    }));
  }

  private matchesRule(ticket: any, rule: RoutingRule): boolean {
    const { conditions } = rule;

    if (conditions.channel && ticket.channel !== conditions.channel) {
      return false;
    }

    if (conditions.priority && ticket.priority !== conditions.priority) {
      return false;
    }

    if (conditions.tags && conditions.tags.length > 0) {
      const ticketTags: string[] = ticket.tags ?? [];
      const hasAllTags = conditions.tags.every((tag: string) =>
        ticketTags.includes(tag),
      );
      if (!hasAllTags) return false;
    }

    return true;
  }
}
