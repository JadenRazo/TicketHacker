import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WidgetService } from './widget.service';

class WidgetAuthGuard {
  constructor(private jwt: JwtService) {}
}

@Controller('widget')
export class WidgetController {
  constructor(
    private widgetService: WidgetService,
    private jwt: JwtService,
  ) {}

  @Post('init')
  init(@Body('tenantId') tenantId: string) {
    return this.widgetService.init(tenantId);
  }

  @Post('conversations')
  createConversation(
    @Body()
    body: {
      tenantId: string;
      name?: string;
      email?: string;
      metadata?: Record<string, any>;
    },
  ) {
    return this.widgetService.createConversation(body.tenantId, {
      name: body.name,
      email: body.email,
      metadata: body.metadata,
    });
  }

  @Get('conversations/:conversationId/messages')
  async getMessages(
    @Param('conversationId') conversationId: string,
    @Query('token') token: string,
  ) {
    const payload = this.verifyWidgetToken(token);
    return this.widgetService.getMessages(payload.tenantId, conversationId);
  }

  @Post('conversations/:conversationId/messages')
  async sendMessage(
    @Param('conversationId') conversationId: string,
    @Body() body: { token: string; content: string },
  ) {
    const payload = this.verifyWidgetToken(body.token);
    return this.widgetService.sendMessage(
      payload.tenantId,
      conversationId,
      payload.contactId,
      body.content,
    );
  }

  @Post('conversations/:conversationId/typing')
  async typing(
    @Param('conversationId') conversationId: string,
    @Body() body: { token: string; isTyping: boolean },
  ) {
    this.verifyWidgetToken(body.token);
    return { success: true };
  }

  @Post('conversations/:conversationId/rate')
  async rate(
    @Param('conversationId') conversationId: string,
    @Body() body: { token: string; rating: number; comment?: string },
  ) {
    const payload = this.verifyWidgetToken(body.token);
    return this.widgetService.submitRating(
      payload.tenantId,
      conversationId,
      payload.contactId,
      body.rating,
      body.comment,
    );
  }

  private verifyWidgetToken(token: string): {
    tenantId: string;
    contactId: string;
    conversationId: string;
  } {
    try {
      const payload = this.jwt.verify(token);
      if (payload.type !== 'widget') throw new Error('Invalid token type');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid widget token');
    }
  }
}
