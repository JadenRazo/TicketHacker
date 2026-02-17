import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageFiltersDto } from './dto/message-filters.dto';
import { MessageDirection, TicketStatus, MessageType } from '@prisma/client';
import { paginateResult } from '../common/utils/paginate';

@Injectable()
export class MessageService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(
    tenantId: string,
    ticketId: string,
    senderId: string,
    dto: CreateMessageDto,
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    const messageType = dto.messageType || MessageType.TEXT;
    const direction =
      messageType === MessageType.NOTE
        ? MessageDirection.OUTBOUND
        : MessageDirection.OUTBOUND;

    const message = await this.prisma.message.create({
      data: {
        tenantId,
        ticketId,
        senderId,
        direction,
        contentText: dto.contentText,
        contentHtml: dto.contentHtml,
        messageType,
      },
      include: {
        sender: {
          select: { id: true, name: true, avatarUrl: true },
        },
        contact: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (
      (ticket.status === TicketStatus.RESOLVED ||
        ticket.status === TicketStatus.CLOSED) &&
      messageType === MessageType.TEXT
    ) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.OPEN },
      });
    }

    this.eventEmitter.emit('message.created', { tenantId, message, ticketId });

    return message;
  }

  async findAll(
    tenantId: string,
    ticketId: string,
    filters: MessageFiltersDto,
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    const { cursor, limit = 50 } = filters;

    const findManyArgs: any = {
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      include: {
        sender: {
          select: { id: true, name: true, avatarUrl: true },
        },
        contact: {
          select: { id: true, name: true, email: true },
        },
      },
    };

    if (cursor) {
      findManyArgs.cursor = { id: cursor };
      findManyArgs.skip = 1;
    }

    const messages = await this.prisma.message.findMany(findManyArgs);

    return paginateResult(messages, limit);
  }
}
