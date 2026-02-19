import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketFiltersDto } from './dto/ticket-filters.dto';
import { BulkUpdateDto } from './dto/bulk-update.dto';
import { TicketStatus } from '@prisma/client';
import { paginateResult } from '../common/utils/paginate';

@Injectable()
export class TicketService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(tenantId: string, userId: string, dto: CreateTicketDto) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: dto.contactId },
    });

    if (!contact || contact.tenantId !== tenantId) {
      throw new NotFoundException('Contact not found');
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        tenantId,
        subject: dto.subject,
        contactId: dto.contactId,
        channel: dto.channel,
        priority: dto.priority,
        teamId: dto.teamId,
        tags: dto.tags || [],
        customFields: dto.customFields || {},
      },
      include: {
        assignee: {
          select: { id: true, name: true, avatarUrl: true },
        },
        contact: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    this.eventEmitter.emit('ticket.created', { tenantId, ticket });

    return ticket;
  }

  async findAll(tenantId: string, filters: TicketFiltersDto) {
    const {
      status,
      priority,
      assigneeId,
      teamId,
      channel,
      tags,
      search,
      snoozed,
      savedViewId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      cursor,
      limit = 20,
    } = filters;

    const where: any = { tenantId };

    if (status && status.length > 0) {
      where.status = { in: status };
    }

    if (priority && priority.length > 0) {
      where.priority = { in: priority };
    }

    if (assigneeId) {
      where.assigneeId = assigneeId;
    }

    if (teamId) {
      where.teamId = teamId;
    }

    if (channel && channel.length > 0) {
      where.channel = { in: channel };
    }

    if (tags && tags.length > 0) {
      where.tags = { hasSome: tags };
    }

    if (search) {
      where.subject = { contains: search, mode: 'insensitive' };
    }

    if (typeof snoozed === 'boolean') {
      if (snoozed) {
        where.snoozedUntil = { not: null, gt: new Date() };
      } else {
        where.OR = [
          { snoozedUntil: null },
          { snoozedUntil: { lte: new Date() } },
        ];
      }
    }

    if (savedViewId) {
      const savedView = await this.prisma.savedView.findFirst({
        where: { id: savedViewId, tenantId },
      });
      if (savedView) {
        Object.assign(where, savedView.filters);
      }
    }

    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    const findManyArgs: any = {
      where,
      orderBy,
      take: limit + 1,
      include: {
        assignee: {
          select: { id: true, name: true, avatarUrl: true },
        },
        contact: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { messages: true },
        },
      },
    };

    if (cursor) {
      findManyArgs.cursor = { id: cursor };
      findManyArgs.skip = 1;
    }

    const tickets = await this.prisma.ticket.findMany(findManyArgs);

    return paginateResult(tickets, limit);
  }

  async findOne(tenantId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        assignee: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        contact: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            metadata: true,
          },
        },
        team: {
          select: { id: true, name: true, description: true },
        },
        rating: {
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async update(tenantId: string, ticketId: string, dto: UpdateTicketDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    const updateData: any = {};

    if (dto.subject !== undefined) updateData.subject = dto.subject;
    if (dto.status !== undefined) {
      updateData.status = dto.status;
      if (dto.status === TicketStatus.RESOLVED) {
        updateData.resolvedAt = new Date();
      }
      if (dto.status === TicketStatus.CLOSED) {
        updateData.closedAt = new Date();
      }
    }
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.assigneeId !== undefined) updateData.assigneeId = dto.assigneeId;
    if (dto.teamId !== undefined) updateData.teamId = dto.teamId;
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    if (dto.customFields !== undefined)
      updateData.customFields = dto.customFields;
    if (dto.snoozedUntil !== undefined) {
      updateData.snoozedUntil = dto.snoozedUntil
        ? new Date(dto.snoozedUntil)
        : null;
    }

    const updatedTicket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
      include: {
        assignee: {
          select: { id: true, name: true, avatarUrl: true },
        },
        contact: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    this.eventEmitter.emit('ticket.updated', {
      tenantId,
      ticket: updatedTicket,
      previousAssigneeId: ticket.assigneeId ?? undefined,
    });

    return updatedTicket;
  }

  async snooze(tenantId: string, ticketId: string, until: Date | null) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { snoozedUntil: until },
    });
  }

  async merge(tenantId: string, sourceId: string, targetId: string) {
    const [sourceTicket, targetTicket] = await Promise.all([
      this.prisma.ticket.findUnique({ where: { id: sourceId } }),
      this.prisma.ticket.findUnique({ where: { id: targetId } }),
    ]);

    if (
      !sourceTicket ||
      sourceTicket.tenantId !== tenantId ||
      !targetTicket ||
      targetTicket.tenantId !== tenantId
    ) {
      throw new NotFoundException('Ticket not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.message.updateMany({
        where: { ticketId: sourceId },
        data: { ticketId: targetId },
      });

      await tx.ticket.update({
        where: { id: sourceId },
        data: {
          mergedIntoId: targetId,
          status: TicketStatus.CLOSED,
          closedAt: new Date(),
        },
      });
    });

    this.eventEmitter.emit('ticket.merged', {
      tenantId,
      sourceId,
      targetId,
    });

    return this.findOne(tenantId, targetId);
  }

  async bulkUpdate(tenantId: string, dto: BulkUpdateDto) {
    const { ticketIds, updates } = dto;

    const tickets = await this.prisma.ticket.findMany({
      where: {
        id: { in: ticketIds },
        tenantId,
      },
    });

    if (tickets.length !== ticketIds.length) {
      throw new NotFoundException('One or more tickets not found');
    }

    const updateData: any = {};
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.assigneeId !== undefined)
      updateData.assigneeId = updates.assigneeId;
    if (updates.tags !== undefined) updateData.tags = updates.tags;

    await this.prisma.ticket.updateMany({
      where: {
        id: { in: ticketIds },
        tenantId,
      },
      data: updateData,
    });

    return { updated: ticketIds.length };
  }
}
