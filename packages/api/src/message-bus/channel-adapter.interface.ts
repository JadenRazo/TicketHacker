export interface UnifiedMessage {
  tenantId: string;
  ticketId: string;
  contactId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  contentText: string;
  contentHtml?: string;
  externalId?: string;
  metadata?: Record<string, any>;
}

export interface ChannelAdapter {
  readonly channel: string;
  handleInbound(raw: any, tenantId: string): Promise<UnifiedMessage>;
  sendOutbound(
    message: UnifiedMessage,
    connection: { config: Record<string, any> },
  ): Promise<string | null>;
  validateConnection(config: Record<string, any>): Promise<boolean>;
}
