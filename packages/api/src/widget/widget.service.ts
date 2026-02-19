import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { OpenclawService } from '../openclaw/openclaw.service';

@Injectable()
export class WidgetService {
  private readonly logger = new Logger(WidgetService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private eventEmitter: EventEmitter2,
    private openclawService: OpenclawService,
  ) {}

  async init(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        settings: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const settings = tenant.settings as Record<string, any>;
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      widget: {
        primaryColor: settings?.widget?.primaryColor || '#2563eb',
        position: settings?.widget?.position || 'bottom-right',
        greeting:
          settings?.widget?.greeting || `Hi! How can we help you today?`,
        awayMessage:
          settings?.widget?.awayMessage ||
          "We're away right now but will respond soon.",
        logo: settings?.widget?.logo || null,
        avatar: settings?.widget?.avatar || null,
        preChatFields: settings?.widget?.preChatFields || [
          { name: 'name', label: 'Your name', type: 'text', required: true },
          {
            name: 'email',
            label: 'Email address',
            type: 'email',
            required: true,
          },
        ],
        businessHours: settings?.businessHours || null,
      },
    };
  }

  async createConversation(
    tenantId: string,
    data: { name?: string; email?: string; metadata?: Record<string, any> },
  ) {
    const externalId = data.email || `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const contact = await this.prisma.contact.upsert({
      where: {
        tenantId_channel_externalId: {
          tenantId,
          channel: 'CHAT_WIDGET',
          externalId,
        },
      },
      update: { name: data.name || undefined },
      create: {
        tenantId,
        externalId,
        name: data.name || 'Visitor',
        email: data.email || null,
        channel: 'CHAT_WIDGET',
        metadata: data.metadata || {},
      },
    });

    const ticket = await this.prisma.ticket.create({
      data: {
        tenantId,
        subject: `Chat from ${contact.name || 'Visitor'}`,
        channel: 'CHAT_WIDGET',
        contactId: contact.id,
        status: 'OPEN',
        priority: 'NORMAL',
      },
    });

    this.eventEmitter.emit('ticket.created', { tenantId, ticket });

    const token = this.jwt.sign(
      {
        sub: contact.id,
        tenantId,
        contactId: contact.id,
        conversationId: ticket.id,
        type: 'widget',
      },
      { expiresIn: '30d' },
    );

    return {
      token,
      conversationId: ticket.id,
      contactId: contact.id,
    };
  }

  async getMessages(tenantId: string, conversationId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!ticket) throw new NotFoundException('Conversation not found');

    const messages = await this.prisma.message.findMany({
      where: { ticketId: conversationId, tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        direction: true,
        contentText: true,
        contentHtml: true,
        messageType: true,
        createdAt: true,
        sender: { select: { name: true, avatarUrl: true } },
      },
    });

    return messages.filter((m) => m.messageType !== 'NOTE');
  }

  async sendMessage(
    tenantId: string,
    conversationId: string,
    contactId: string,
    content: string,
  ) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!ticket) throw new NotFoundException('Conversation not found');

    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      await this.prisma.ticket.update({
        where: { id: conversationId },
        data: { status: 'OPEN', resolvedAt: null, closedAt: null },
      });
    }

    const message = await this.prisma.message.create({
      data: {
        tenantId,
        ticketId: conversationId,
        contactId,
        direction: 'INBOUND',
        contentText: content,
        messageType: 'TEXT',
      },
    });

    this.eventEmitter.emit('message.created', {
      tenantId,
      ticketId: conversationId,
      message,
    });

    await this.tryWidgetAiResponse(tenantId, conversationId, content);

    return message;
  }

  private async tryWidgetAiResponse(
    tenantId: string,
    ticketId: string,
    customerMessage: string,
  ): Promise<void> {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });

      const settings = (tenant?.settings as any) || {};
      if (!settings.openclawEnabled || !settings.openclawWidgetAgent) return;
      if (!this.openclawService.isEnabled()) return;

      const threshold = settings.openclawConfidenceThreshold || 0.8;

      const result = await this.openclawService.handleWidgetMessage(
        ticketId,
        tenantId,
        customerMessage,
        { model: settings.openclawModel, confidenceThreshold: threshold },
      );

      if (result.action === 'replied' && result.confidence >= threshold) {
        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: {
            metadata: {
              isAiHandled: true,
              lastAiAction: result.action,
              aiConfidence: result.confidence,
            },
          },
        });
      } else if (result.action === 'needs_human') {
        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: {
            metadata: {
              isAiHandled: false,
              aiEscalatedAt: new Date().toISOString(),
            },
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Widget AI response failed for ticket ${ticketId}`,
        error,
      );
    }
  }

  async submitRating(
    tenantId: string,
    conversationId: string,
    contactId: string,
    rating: number,
    comment?: string,
  ) {
    // Update the legacy per-contact satisfaction rating for backward compatibility
    await this.prisma.contact.update({
      where: { id: contactId },
      data: { satisfactionRating: rating },
    });

    // Upsert a per-ticket TicketRating record so CSAT data is tracked at the
    // ticket level and never silently overwritten across conversations.
    await this.prisma.ticketRating.upsert({
      where: { ticketId: conversationId },
      update: {
        rating,
        comment: comment ?? null,
      },
      create: {
        tenantId,
        ticketId: conversationId,
        contactId,
        rating,
        comment: comment ?? null,
      },
    });

    this.logger.log(
      `CSAT rating ${rating} submitted for ticket ${conversationId} by contact ${contactId}`,
    );

    return { success: true };
  }
}
