import {
  Controller,
  Post,
  Param,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AiService } from './ai.service';
import { AiInteractionService } from './ai-interaction.service';
import { PrismaService } from '../prisma/prisma.service';
import { MessageDirection } from '@prisma/client';

@Controller('ai')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiInteractionService: AiInteractionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('classify/:ticketId')
  async classifyTicket(
    @Param('ticketId') ticketId: string,
    @Request() req: any,
  ): Promise<any> {
    const tenantId = req.tenantId;
    const startTime = Date.now();

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          where: { direction: MessageDirection.INBOUND },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    const firstMessage = ticket.messages[0]?.contentText || '';

    const classification = await this.aiService.classifyTicket({
      subject: ticket.subject,
      firstMessage,
    });

    const latencyMs = Date.now() - startTime;

    if (classification) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          metadata: {
            ...(ticket.metadata as Record<string, unknown>),
            aiClassification: classification as unknown as Record<string, unknown>,
          } as any,
        },
      });

      await this.aiInteractionService.logInteraction({
        tenantId,
        ticketId,
        action: 'classify',
        model: 'gpt-3.5-turbo',
        latencyMs,
        accepted: true,
      });
    }

    return { classification };
  }

  @Post('suggest/:ticketId')
  async suggestReplies(
    @Param('ticketId') ticketId: string,
    @Request() req: any,
  ): Promise<any> {
    const tenantId = req.tenantId;
    const startTime = Date.now();

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: { select: { name: true } },
            contact: { select: { name: true } },
          },
        },
        tenant: { select: { settings: true } },
      },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    const messages = ticket.messages.map((msg) => ({
      role: msg.direction === MessageDirection.INBOUND ? 'customer' : 'agent',
      content: msg.contentText,
    }));

    const tenantSettings = ticket.tenant.settings as any;
    const brandVoice = tenantSettings?.brandVoice;

    const suggestions = await this.aiService.suggestReplies(messages, brandVoice);

    const latencyMs = Date.now() - startTime;

    await this.aiInteractionService.logInteraction({
      tenantId,
      ticketId,
      action: 'suggest_replies',
      model: 'gpt-3.5-turbo',
      latencyMs,
    });

    return { suggestions };
  }

  @Post('summarize/:ticketId')
  async summarizeThread(
    @Param('ticketId') ticketId: string,
    @Request() req: any,
  ): Promise<any> {
    const tenantId = req.tenantId;
    const startTime = Date.now();

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    const messages = ticket.messages.map((msg) => ({
      role: msg.direction === MessageDirection.INBOUND ? 'customer' : 'agent',
      content: msg.contentText,
    }));

    const summary = await this.aiService.summarizeThread(messages);

    const latencyMs = Date.now() - startTime;

    await this.aiInteractionService.logInteraction({
      tenantId,
      ticketId,
      action: 'summarize',
      model: 'gpt-3.5-turbo',
      latencyMs,
    });

    return { summary };
  }

}
