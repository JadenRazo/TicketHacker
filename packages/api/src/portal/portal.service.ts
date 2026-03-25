import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { MessageDirection, MessageType, TicketStatus } from '@prisma/client';
import { PortalJwtPayload } from './portal-auth.guard';

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ----------------------------------------------------------------
  // Auth: request a magic link
  // ----------------------------------------------------------------
  async requestMagicLink(tenantSlug: string, email: string): Promise<{ message: string }> {
    // Always return the same message to avoid email enumeration
    const genericResponse = {
      message: 'If an account exists, a login link has been sent',
    };

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      // Silently succeed – do not reveal that the tenant does not exist
      return genericResponse;
    }

    const contact = await this.prisma.contact.findFirst({
      where: {
        tenantId: tenant.id,
        email: email.toLowerCase().trim(),
      },
    });

    if (!contact) {
      return genericResponse;
    }

    // Build a short-lived portal JWT (1 hour)
    const payload: PortalJwtPayload = {
      contactId: contact.id,
      tenantId: tenant.id,
      type: 'portal',
    };

    const token = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: '1h',
    });

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:5173');
    const magicLink = `${appUrl}/portal/${tenantSlug}/verify?token=${token}`;

    await this.sendMagicLinkEmail(contact.email ?? '', contact.name ?? 'Customer', tenant.name, magicLink);

    return genericResponse;
  }

  // ----------------------------------------------------------------
  // Auth: verify magic link token and issue a session token
  // ----------------------------------------------------------------
  async verifyMagicLink(
    tenantSlug: string,
    token: string,
  ): Promise<{ contact: object; sessionToken: string }> {
    let payload: PortalJwtPayload;

    try {
      payload = this.jwt.verify<PortalJwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired login link');
    }

    if (payload.type !== 'portal') {
      throw new BadRequestException('Invalid token type');
    }

    // Confirm the tenant slug matches what was encoded in the token
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant || tenant.id !== payload.tenantId) {
      throw new BadRequestException('Token does not match this portal');
    }

    const contact = await this.prisma.contact.findUnique({
      where: { id: payload.contactId },
    });

    if (!contact || contact.tenantId !== payload.tenantId) {
      throw new NotFoundException('Contact not found');
    }

    // Issue a longer-lived session token (24 hours)
    const sessionPayload: PortalJwtPayload = {
      contactId: contact.id,
      tenantId: contact.tenantId,
      type: 'portal',
    };

    const sessionToken = this.jwt.sign(sessionPayload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: '24h',
    });

    return {
      contact: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        channel: contact.channel,
      },
      sessionToken,
    };
  }

  // ----------------------------------------------------------------
  // Tickets: list all tickets for authenticated contact
  // ----------------------------------------------------------------
  async getContactTickets(contactId: string, tenantId: string) {
    return this.prisma.ticket.findMany({
      where: { contactId, tenantId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        subject: true,
        status: true,
        priority: true,
        channel: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  // ----------------------------------------------------------------
  // Tickets: get a single ticket with visible messages
  // ----------------------------------------------------------------
  async getContactTicket(contactId: string, tenantId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        status: true,
        priority: true,
        channel: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        contactId: true,
        tenantId: true,
        messages: {
          where: {
            messageType: {
              // Never expose internal notes or AI suggestions to customers
              notIn: [MessageType.NOTE, MessageType.AI_SUGGESTION],
            },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            direction: true,
            contentText: true,
            contentHtml: true,
            messageType: true,
            createdAt: true,
          },
        },
      },
    });

    if (!ticket || ticket.tenantId !== tenantId || ticket.contactId !== contactId) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  // ----------------------------------------------------------------
  // Tickets: customer replies to a ticket
  // ----------------------------------------------------------------
  async replyToTicket(
    contactId: string,
    tenantId: string,
    ticketId: string,
    content: string,
  ) {
    if (!content || !content.trim()) {
      throw new BadRequestException('Reply content cannot be empty');
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || ticket.tenantId !== tenantId || ticket.contactId !== contactId) {
      throw new ForbiddenException('Ticket not found or access denied');
    }

    const message = await this.prisma.message.create({
      data: {
        tenantId,
        ticketId,
        contactId,
        direction: MessageDirection.INBOUND,
        contentText: content.trim(),
        messageType: MessageType.TEXT,
      },
      select: {
        id: true,
        direction: true,
        contentText: true,
        contentHtml: true,
        messageType: true,
        createdAt: true,
      },
    });

    // Reopen the ticket if it was resolved or closed
    if (
      ticket.status === TicketStatus.RESOLVED ||
      ticket.status === TicketStatus.CLOSED
    ) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.OPEN },
      });
    }

    // Trigger existing event flows (AI copilot, agent notifications, etc.)
    this.eventEmitter.emit('message.created', { tenantId, message, ticketId });

    return message;
  }

  // ----------------------------------------------------------------
  // Private: send the magic link email
  // ----------------------------------------------------------------
  private async sendMagicLinkEmail(
    to: string,
    contactName: string,
    tenantName: string,
    magicLink: string,
  ): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST', 'localhost');
    const port = this.config.get<number>('SMTP_PORT', 587);
    const secure = port === 465;
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from = this.config.get<string>('SMTP_FROM', 'noreply@tickethacker.local');

    const transportOptions: any = { host, port, secure };
    if (user && pass) {
      transportOptions.auth = { user, pass };
    }

    const transporter = nodemailer.createTransport(transportOptions);

    const greeting = contactName ? `Hi ${contactName},` : 'Hi,';

    const text = [
      greeting,
      '',
      `You requested a link to view your support tickets with ${tenantName}.`,
      '',
      `Click the link below to sign in. This link is valid for 1 hour.`,
      '',
      magicLink,
      '',
      'If you did not request this, you can safely ignore this email.',
      '',
      `${tenantName} Support`,
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your login link</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;max-width:100%;">
          <tr>
            <td style="background:#2563eb;padding:28px 40px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${tenantName} Support</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;font-size:15px;color:#1e293b;">${greeting}</p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                You requested a link to view your support tickets. Click the button below to sign in.
                This link is valid for <strong>1 hour</strong>.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <a href="${magicLink}"
                       style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
                      View My Tickets
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
                If the button above does not work, copy and paste this link into your browser:<br/>
                <a href="${magicLink}" style="color:#2563eb;word-break:break-all;">${magicLink}</a>
              </p>
              <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;">
                If you did not request this link, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">${tenantName} Support Team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    try {
      await transporter.sendMail({
        from,
        to,
        subject: `Your login link for ${tenantName} Support`,
        text,
        html,
      });

      this.logger.log(`Magic link email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send magic link email to ${to}`, error);
      // Swallow the error so that the API response stays consistent –
      // the caller already returned the generic message before we send.
      // Logging is sufficient; we do not want to expose mail failures.
    }
  }
}
