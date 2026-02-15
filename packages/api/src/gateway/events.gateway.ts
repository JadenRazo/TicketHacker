import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

interface SocketData {
  userId: string;
  tenantId: string;
  userName: string;
}

type SocketWithData = Socket & {
  data: SocketData;
}

interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private redisClient: Redis;

  constructor(private jwtService: JwtService) {}

  afterInit(server: Server) {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6381', 10);

    this.redisClient = new Redis({
      host: redisHost,
      port: redisPort,
    });

    try {
      const pubClient = new Redis({ host: redisHost, port: redisPort });
      const subClient = new Redis({ host: redisHost, port: redisPort });
      const adapter = createAdapter(pubClient, subClient);
      (server as any).adapter(adapter);
      this.logger.log('WebSocket gateway initialized with Redis adapter');
    } catch (error) {
      this.logger.warn(
        `Redis adapter setup skipped: ${error.message}. Using default adapter.`,
      );
    }
  }

  async handleConnection(client: SocketWithData) {
    try {
      const token = client.handshake.auth?.token;

      if (!token) {
        this.logger.warn(`Client ${client.id} disconnected: No token provided`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });

      if (!payload || !payload.sub || !payload.tenantId) {
        this.logger.warn(`Client ${client.id} disconnected: Invalid token`);
        client.disconnect();
        return;
      }

      client.data = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        userName: payload.email.split('@')[0],
      };

      await client.join(`tenant:${payload.tenantId}`);

      await this.setAgentPresence(payload.tenantId, payload.sub);

      this.server
        .to(`tenant:${payload.tenantId}`)
        .emit('agent:online', { userId: payload.sub });

      this.logger.log(
        `Client ${client.id} connected - User: ${payload.sub}, Tenant: ${payload.tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Client ${client.id} authentication failed: ${error.message}`,
      );
      client.disconnect();
    }
  }

  async handleDisconnect(client: SocketWithData) {
    if (!client.data?.userId || !client.data?.tenantId) {
      return;
    }

    const { userId, tenantId } = client.data;

    const rooms = Array.from(client.rooms).filter(
      (room): room is string =>
        typeof room === 'string' &&
        room.startsWith('ticket:') &&
        room !== client.id,
    );

    for (const room of rooms) {
      const ticketId = room.replace('ticket:', '');
      await this.removeFromViewers(ticketId, userId);
      await this.broadcastViewers(ticketId);
    }

    await this.removeAgentPresence(tenantId, userId);

    this.server
      .to(`tenant:${tenantId}`)
      .emit('agent:offline', { userId });

    this.logger.log(`Client ${client.id} disconnected - User: ${userId}`);
  }

  @SubscribeMessage('ticket:join')
  async handleTicketJoin(
    @ConnectedSocket() client: SocketWithData,
    @MessageBody() data: { ticketId: string },
  ) {
    const { ticketId } = data;
    const { userId, tenantId } = client.data;

    await client.join(`ticket:${ticketId}`);

    await this.addToViewers(ticketId, userId);

    await this.broadcastViewers(ticketId);

    this.logger.debug(
      `User ${userId} joined ticket ${ticketId} (tenant: ${tenantId})`,
    );

    return { success: true };
  }

  @SubscribeMessage('ticket:leave')
  async handleTicketLeave(
    @ConnectedSocket() client: SocketWithData,
    @MessageBody() data: { ticketId: string },
  ) {
    const { ticketId } = data;
    const { userId } = client.data;

    await client.leave(`ticket:${ticketId}`);

    await this.removeFromViewers(ticketId, userId);

    await this.broadcastViewers(ticketId);

    this.logger.debug(`User ${userId} left ticket ${ticketId}`);

    return { success: true };
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: SocketWithData,
    @MessageBody() data: { ticketId: string; isTyping: boolean },
  ) {
    const { ticketId, isTyping } = data;
    const { userId, userName } = client.data;

    client.to(`ticket:${ticketId}`).emit('typing', {
      userId,
      userName,
      isTyping,
    });

    return { success: true };
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: SocketWithData) {
    const { userId, tenantId } = client.data;

    await this.setAgentPresence(tenantId, userId);

    return { success: true };
  }

  @SubscribeMessage('presence:list')
  async handlePresenceList(@ConnectedSocket() client: SocketWithData) {
    const { tenantId } = client.data;

    const pattern = `presence:${tenantId}:*`;
    const keys = await this.scanRedisKeys(pattern);

    const agentIds = keys.map((key) => key.split(':')[2]);

    return { agentIds };
  }

  @OnEvent('ticket.created')
  async handleTicketCreated(payload: { tenantId: string; ticket: any }) {
    const { tenantId, ticket } = payload;

    this.server.to(`tenant:${tenantId}`).emit('ticket:created', ticket);

    this.logger.debug(
      `Broadcast ticket:created to tenant ${tenantId} - ticket ${ticket.id}`,
    );
  }

  @OnEvent('ticket.updated')
  async handleTicketUpdated(payload: { tenantId: string; ticket: any }) {
    const { tenantId, ticket } = payload;

    this.server.to(`tenant:${tenantId}`).emit('ticket:updated', ticket);
    this.server.to(`ticket:${ticket.id}`).emit('ticket:updated', ticket);

    this.logger.debug(
      `Broadcast ticket:updated to tenant ${tenantId} and ticket room ${ticket.id}`,
    );
  }

  @OnEvent('ticket.merged')
  async handleTicketMerged(payload: {
    tenantId: string;
    sourceId: string;
    targetId: string;
  }) {
    const { tenantId, sourceId, targetId } = payload;

    this.server.to(`tenant:${tenantId}`).emit('ticket:merged', {
      sourceId,
      targetId,
    });

    this.logger.debug(
      `Broadcast ticket:merged to tenant ${tenantId} - source ${sourceId} to target ${targetId}`,
    );
  }

  @OnEvent('message.created')
  async handleMessageCreated(payload: {
    tenantId: string;
    message: any;
    ticketId: string;
  }) {
    const { ticketId, message } = payload;

    this.server.to(`ticket:${ticketId}`).emit('message:created', message);

    this.logger.debug(
      `Broadcast message:created to ticket room ${ticketId} - message ${message.id}`,
    );
  }

  private async setAgentPresence(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const key = `presence:${tenantId}:${userId}`;
    await this.redisClient.set(key, Date.now().toString(), 'EX', 30);
  }

  private async removeAgentPresence(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const key = `presence:${tenantId}:${userId}`;
    await this.redisClient.del(key);
  }

  private async addToViewers(
    ticketId: string,
    userId: string,
  ): Promise<void> {
    const key = `viewing:${ticketId}`;
    await this.redisClient.sadd(key, userId);
  }

  private async removeFromViewers(
    ticketId: string,
    userId: string,
  ): Promise<void> {
    const key = `viewing:${ticketId}`;
    await this.redisClient.srem(key, userId);
  }

  private async getViewers(ticketId: string): Promise<string[]> {
    const key = `viewing:${ticketId}`;
    return await this.redisClient.smembers(key);
  }

  private async broadcastViewers(ticketId: string): Promise<void> {
    const viewers = await this.getViewers(ticketId);

    this.server.to(`ticket:${ticketId}`).emit('ticket:viewers', { viewers });
  }

  private async scanRedisKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, foundKeys] = await this.redisClient.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    return keys;
  }
}
