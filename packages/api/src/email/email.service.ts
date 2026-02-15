import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { InboundEmailDto } from './dto/inbound-email.dto';
import { Channel, MessageDirection, MessageType } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.transporter = this.createTransport();
  }

  createTransport(): Transporter {
    const host = this.config.get<string>('SMTP_HOST', 'localhost');
    const port = this.config.get<number>('SMTP_PORT', 587);
    const secure = port === 465;
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    const transportOptions: any = {
      host,
      port,
      secure,
    };

    if (user && pass) {
      transportOptions.auth = {
        user,
        pass,
      };
    }

    this.logger.log(`SMTP transport configured for ${host}:${port}`);
    return nodemailer.createTransport(transportOptions);
  }

  async handleInbound(payload: InboundEmailDto): Promise<void> {
    try {
      const fromEmail = this.extractEmail(payload.from);
      const toEmail = this.extractEmail(payload.to);
      const inReplyTo = payload.headers?.inReplyTo;

      let ticket;
      let contact;
      let tenantId: string;

      if (inReplyTo && this.isTicketToken(inReplyTo)) {
        const ticketId = this.extractTicketIdFromToken(inReplyTo);
        ticket = await this.prisma.ticket.findUnique({
          where: { id: ticketId },
          include: { contact: true },
        });

        if (!ticket) {
          this.logger.warn(`Ticket not found for In-Reply-To: ${inReplyTo}`);
          return;
        }

        tenantId = ticket.tenantId;
        contact = ticket.contact;
      } else {
        const slug = this.extractSlugFromEmail(toEmail);
        const tenant = await this.prisma.tenant.findUnique({
          where: { slug },
        });

        if (!tenant) {
          this.logger.warn(`Tenant not found for slug: ${slug}`);
          return;
        }

        tenantId = tenant.id;

        contact = await this.prisma.contact.findUnique({
          where: {
            tenantId_channel_externalId: {
              tenantId,
              channel: Channel.EMAIL,
              externalId: fromEmail,
            },
          },
        });

        if (!contact) {
          contact = await this.prisma.contact.create({
            data: {
              tenantId,
              channel: Channel.EMAIL,
              externalId: fromEmail,
              email: fromEmail,
              name: this.extractNameFromEmail(payload.from),
            },
          });
        }

        ticket = await this.prisma.ticket.create({
          data: {
            tenantId,
            contactId: contact.id,
            subject: payload.subject || '(No Subject)',
            channel: Channel.EMAIL,
          },
        });

        this.eventEmitter.emit('ticket.created', { tenantId, ticket });
      }

      const message = await this.prisma.message.create({
        data: {
          tenantId,
          ticketId: ticket.id,
          contactId: contact.id,
          direction: MessageDirection.INBOUND,
          contentText: payload.text,
          contentHtml: payload.html,
          messageType: MessageType.TEXT,
          metadata: {
            emailHeaders: payload.headers,
            from: payload.from,
          },
        },
      });

      this.eventEmitter.emit('message.created', {
        tenantId,
        message,
        ticketId: ticket.id,
      });

      this.logger.log(`Processed inbound email for ticket ${ticket.id}`);
    } catch (error) {
      this.logger.error('Failed to handle inbound email', error);
      throw error;
    }
  }

  async sendOutbound(ticketId: string, content: string): Promise<void> {
    try {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          contact: true,
          tenant: true,
        },
      });

      if (!ticket) {
        throw new NotFoundException('Ticket not found');
      }

      if (!ticket.contact.email) {
        throw new Error('Contact does not have an email address');
      }

      const tenant = ticket.tenant;
      const ticketToken = this.generateTicketToken(ticketId, tenant.slug);
      const fromAddress = `${tenant.name} Support <support@${tenant.slug}.tickets.local>`;
      const replyToAddress = `ticket-${ticketId}@${tenant.slug}.tickets.local`;

      const mailOptions = {
        from: fromAddress,
        to: ticket.contact.email,
        subject: `Re: ${ticket.subject}`,
        text: content,
        replyTo: replyToAddress,
        headers: {
          'Message-ID': ticketToken,
          'In-Reply-To': ticketToken,
          References: ticketToken,
        },
      };

      await this.transporter.sendMail(mailOptions);

      this.logger.log(`Sent outbound email for ticket ${ticketId}`);
    } catch (error) {
      this.logger.error(`Failed to send outbound email for ticket ${ticketId}`, error);
      throw error;
    }
  }

  private extractEmail(emailString: string): string {
    const match = emailString.match(/<(.+?)>/);
    return match ? match[1] : emailString.trim();
  }

  private extractNameFromEmail(emailString: string): string {
    const match = emailString.match(/^(.+?)\s*</);
    if (match) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
    return this.extractEmail(emailString).split('@')[0];
  }

  private extractSlugFromEmail(email: string): string {
    const match = email.match(/@(.+?)\.tickets\.local/);
    return match ? match[1] : '';
  }

  private isTicketToken(token: string): boolean {
    return token.includes('ticket-') && token.includes('.tickets.local');
  }

  private extractTicketIdFromToken(token: string): string {
    const match = token.match(/ticket-(.+?)@/);
    return match ? match[1] : '';
  }

  private generateTicketToken(ticketId: string, slug: string): string {
    return `<ticket-${ticketId}@${slug}.tickets.local>`;
  }
}
