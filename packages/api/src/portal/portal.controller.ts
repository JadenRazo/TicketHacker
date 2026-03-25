import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PortalService } from './portal.service';
import { PortalAuthGuard } from './portal-auth.guard';
import { IsEmail, IsString, MinLength } from 'class-validator';

// ----------------------------------------------------------------
// DTOs (kept local – the portal surface is self-contained)
// ----------------------------------------------------------------
class RequestMagicLinkDto {
  @IsEmail()
  email: string;
}

class VerifyTokenDto {
  @IsString()
  token: string;
}

class ReplyToTicketDto {
  @IsString()
  @MinLength(1)
  content: string;
}

// ----------------------------------------------------------------
// Controller
// ----------------------------------------------------------------
@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  /**
   * POST /portal/:tenantSlug/auth/request
   * Accepts an email, finds the matching contact, and sends a magic link.
   * Always returns the same generic message to prevent email enumeration.
   */
  @Post(':tenantSlug/auth/request')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  requestMagicLink(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: RequestMagicLinkDto,
  ) {
    return this.portalService.requestMagicLink(tenantSlug, dto.email);
  }

  /**
   * POST /portal/:tenantSlug/auth/verify
   * Verifies a magic link token and issues a longer-lived session token.
   */
  @Post(':tenantSlug/auth/verify')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  verifyToken(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: VerifyTokenDto,
  ) {
    return this.portalService.verifyMagicLink(tenantSlug, dto.token);
  }

  /**
   * GET /portal/tickets
   * Returns the authenticated customer's tickets.
   */
  @Get('tickets')
  @UseGuards(PortalAuthGuard)
  getTickets(@Request() req: any) {
    const { contactId, tenantId } = req.portalContact;
    return this.portalService.getContactTickets(contactId, tenantId);
  }

  /**
   * GET /portal/tickets/:ticketId
   * Returns a single ticket with its public-facing messages.
   */
  @Get('tickets/:ticketId')
  @UseGuards(PortalAuthGuard)
  getTicket(@Request() req: any, @Param('ticketId') ticketId: string) {
    const { contactId, tenantId } = req.portalContact;
    return this.portalService.getContactTicket(contactId, tenantId, ticketId);
  }

  /**
   * POST /portal/tickets/:ticketId/reply
   * Submits a reply from the customer, creating an INBOUND message.
   */
  @Post('tickets/:ticketId/reply')
  @UseGuards(PortalAuthGuard)
  replyToTicket(
    @Request() req: any,
    @Param('ticketId') ticketId: string,
    @Body() dto: ReplyToTicketDto,
  ) {
    const { contactId, tenantId } = req.portalContact;
    return this.portalService.replyToTicket(contactId, tenantId, ticketId, dto.content);
  }
}
