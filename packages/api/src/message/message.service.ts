import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageFiltersDto } from './dto/message-filters.dto';
import { MessageDirection, TicketStatus, MessageType } from '@prisma/client';
import { paginateResult } from '../common/utils/paginate';

// Attachment shape returned alongside messages
const ATTACHMENT_SELECT = {
  id: true,
  filename: true,
  mimeType: true,
  sizeBytes: true,
  url: true,
} as const;

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
        attachments: {
          select: ATTACHMENT_SELECT,
        },
      },
    });

    // Reopen the ticket if it was resolved/closed and an agent is replying
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

    // Link any pre-uploaded attachments to this newly created message.
    // Only unlinked (messageId = null) attachments belonging to the same tenant
    // are updated so callers cannot hijack another tenant's attachments.
    if (dto.attachmentIds && dto.attachmentIds.length > 0) {
      await this.prisma.attachment.updateMany({
        where: {
          id: { in: dto.attachmentIds },
          tenantId,
          messageId: null,
        },
        data: { messageId: message.id },
      });

      // Re-fetch the message so the response includes the newly linked attachments
      const refreshed = await this.prisma.message.findUnique({
        where: { id: message.id },
        include: {
          sender: { select: { id: true, name: true, avatarUrl: true } },
          contact: { select: { id: true, name: true, email: true } },
          attachments: { select: ATTACHMENT_SELECT },
        },
      });

      if (refreshed) {
        this.eventEmitter.emit('message.created', { tenantId, message: refreshed, ticketId });
        return refreshed;
      }
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
        attachments: {
          select: ATTACHMENT_SELECT,
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
