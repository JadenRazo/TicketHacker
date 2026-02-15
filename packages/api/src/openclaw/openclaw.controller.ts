import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { OpenclawService } from './openclaw.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentActionDto, WebhookInboundDto } from './dto/agent-action.dto';

@Controller('openclaw')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
@Roles('AGENT')
export class OpenclawController {
  private readonly logger = new Logger(OpenclawController.name);

  constructor(
    private readonly openclawService: OpenclawService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
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

    return { result };
  }

  @Post('agent/reply/:ticketId')
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

    return { result };
  }

  @Post('agent/resolve/:ticketId')
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

    return { result };
  }

  @Post('agent/summarize/:ticketId')
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

    return { result };
  }

  @Post('webhook/inbound')
  async handleWebhook(@Body() dto: WebhookInboundDto, @Request() req: any) {
    this.logger.log(`Received OpenClaw webhook: ${dto.event}`);

    return { received: true, event: dto.event };
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
