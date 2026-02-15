import { Controller, Post, Body, Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import { InboundEmailDto } from './dto/inbound-email.dto';

@Controller('email')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailService: EmailService) {}

  @Post('inbound')
  async handleInbound(@Body() dto: InboundEmailDto): Promise<{ status: string }> {
    this.logger.log('Received inbound email webhook');
    await this.emailService.handleInbound(dto);
    return { status: 'processed' };
  }
}
