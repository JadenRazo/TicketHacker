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
import { loadThreadContext } from './thread-context';
import { applyClassificationIfCurrent } from './state-guard';

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

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      include: {
        tenant: { select: { settings: true } },
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
      context: await loadThreadContext(this.prisma, tenantId, ticketId),
    });

    const latencyMs = Date.now() - startTime;

    let applied = false;
    if (classification) {
      applied = await applyClassificationIfCurrent(this.prisma, tenantId, ticketId,
        ticket.agentVersion, ticket.tenant.settings, classification);

      await this.aiInteractionService.logInteraction({
        tenantId,
        ticketId,
        action: 'classify',
        model: 'gpt-3.5-turbo',
        latencyMs,
        accepted: applied,
      });
    }

    return { classification, applied };
  }

  @Post('suggest/:ticketId')
  async suggestReplies(
    @Param('ticketId') ticketId: string,
    @Request() req: any,
  ): Promise<any> {
    const tenantId = req.tenantId;
    const startTime = Date.now();

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      include: {
        tenant: { select: { settings: true } },
      },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    const messages = await loadThreadContext(this.prisma, tenantId, ticketId);

    const tenantSettings = ticket.tenant.settings as any;
    const brandVoice = tenantSettings?.brandVoice;

    const suggestions = await this.aiService.suggestReplies(
      messages,
      brandVoice,
    );

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

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    const messages = await loadThreadContext(this.prisma, tenantId, ticketId);

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
