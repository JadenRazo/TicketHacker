import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  UseGuards,
  Request,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { OpenclawService } from './openclaw.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentActionDto, WebhookInboundDto } from './dto/agent-action.dto';

@Controller('openclaw')
export class OpenclawController {
  private readonly logger = new Logger(OpenclawController.name);

  constructor(
    private readonly openclawService: OpenclawService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  @UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
  @Roles('AGENT')
  async getStatus(@Request() req: any) {
    const connectivity = await this.openclawService.checkConnectivity();

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { settings: true },
    });

    const settings = (tenant?.settings as any) || {};

    return {
      ...connectivity,
      tenantConfig: {
        openclawEnabled: settings.openclawEnabled || false,
        openclawAgentMode: settings.openclawAgentMode || 'off',
        openclawWidgetAgent: settings.openclawWidgetAgent || false,
        openclawAutoTriage: settings.openclawAutoTriage || false,
      },
    };
  }

  @Post('agent/triage/:ticketId')
  @UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
  @Roles('AGENT')
  async triageTicket(
    @Param('ticketId') ticketId: string,
    @Body() dto: AgentActionDto,
    @Request() req: any,
  ) {
    const tenantId = req.tenantId;
    await this.validateTicketAccess(ticketId, tenantId);

    const result = await this.openclawService.triageTicket(
      ticketId,
      tenantId,
      { model: dto.model },
    );

    await this.openclawService.appendAiActivity(ticketId, tenantId, {
      action: 'triage',
      result: {
        action: result.action,
        confidence: result.confidence,
        summary: result.summary,
      },
      triggeredBy: 'manual',
      toolCallCount: result.toolCalls.length,
    });

    return { result };
  }

  @Post('agent/reply/:ticketId')
  @UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
  @Roles('AGENT')
  async draftReply(
    @Param('ticketId') ticketId: string,
    @Body() dto: AgentActionDto,
    @Request() req: any,
  ) {
    const tenantId = req.tenantId;
    await this.validateTicketAccess(ticketId, tenantId);

    const result = await this.openclawService.generateDraftReply(
      ticketId,
      tenantId,
      { model: dto.model },
    );

    await this.openclawService.appendAiActivity(ticketId, tenantId, {
      action: 'draft-reply',
      result: {
        action: result.action,
        confidence: result.confidence,
        summary: result.summary,
      },
      triggeredBy: 'manual',
      toolCallCount: result.toolCalls.length,
    });

    return { result };
  }

  @Post('agent/resolve/:ticketId')
  @UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
  @Roles('AGENT')
  async resolveTicket(
    @Param('ticketId') ticketId: string,
    @Body() dto: AgentActionDto,
    @Request() req: any,
  ) {
    const tenantId = req.tenantId;
    await this.validateTicketAccess(ticketId, tenantId);

    const result = await this.openclawService.attemptResolve(
      ticketId,
      tenantId,
      { model: dto.model },
    );

    await this.openclawService.appendAiActivity(ticketId, tenantId, {
      action: 'resolve',
      result: {
        action: result.action,
        confidence: result.confidence,
        summary: result.summary,
      },
      triggeredBy: 'manual',
      toolCallCount: result.toolCalls.length,
    });

    return { result };
  }

  @Post('agent/summarize/:ticketId')
  @UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
  @Roles('AGENT')
  async summarizeTicket(
    @Param('ticketId') ticketId: string,
    @Body() dto: AgentActionDto,
    @Request() req: any,
  ) {
    const tenantId = req.tenantId;
    await this.validateTicketAccess(ticketId, tenantId);

    const result = await this.openclawService.summarizeTicket(
      ticketId,
      tenantId,
      { model: dto.model },
    );

    await this.openclawService.appendAiActivity(ticketId, tenantId, {
      action: 'summarize',
      result: {
        action: result.action,
        confidence: result.confidence,
        summary: result.summary,
      },
      triggeredBy: 'manual',
      toolCallCount: result.toolCalls.length,
    });

    return { result };
  }

  @Post('webhook/inbound')
  async handleWebhook(
    @Body() dto: WebhookInboundDto,
    @Headers('x-webhook-secret') secret: string,
  ) {
    const expectedSecret = this.config.get<string>('OPENCLAW_WEBHOOK_SECRET', '');

    if (!expectedSecret || secret !== expectedSecret) {
      throw new ForbiddenException('Invalid webhook secret');
    }

    this.logger.log(
      `Received OpenClaw webhook: ${dto.event} for ticket ${dto.ticketId}`,
    );

    await this.openclawService.processWebhookEvent(
      dto.event,
      dto.ticketId,
      dto.tenantId,
      dto.payload,
    );

    return { received: true, event: dto.event };
  }

  @Post('agent/feedback/:ticketId')
  @UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
  @Roles('AGENT')
  async submitFeedback(
    @Param('ticketId') ticketId: string,
    @Body() body: { action: string; rating: 'positive' | 'negative' },
    @Request() req: any,
  ) {
    const tenantId = req.tenantId;
    await this.validateTicketAccess(ticketId, tenantId);

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      select: { metadata: true },
    });

    const metadata = (ticket?.metadata as Record<string, any>) || {};
    const feedbackLog = metadata.aiFeedback || [];
    feedbackLog.push({
      action: body.action,
      rating: body.rating,
      userId: req.user.id,
      timestamp: new Date().toISOString(),
    });

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        metadata: { ...metadata, aiFeedback: feedbackLog },
      },
    });

    return { received: true };
  }

  private async validateTicketAccess(
    ticketId: string,
    tenantId: string,
  ): Promise<void> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
  }
}
