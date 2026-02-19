import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationRecord {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  ticketId: string | null;
  isRead: boolean;
  createdAt: Date;
}

interface CreateNotificationData {
  type: string;
  title: string;
  body: string;
  ticketId?: string;
}

interface FindAllParams {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    userId: string,
    data: CreateNotificationData,
  ): Promise<NotificationRecord> {
    return (this.prisma as any).notification.create({
      data: {
        tenantId,
        userId,
        type: data.type,
        title: data.title,
        body: data.body,
        ticketId: data.ticketId ?? null,
      },
    });
  }

  async findAll(
    userId: string,
    tenantId: string,
    params: FindAllParams = {},
  ): Promise<{ notifications: NotificationRecord[]; nextCursor?: string }> {
    const { unreadOnly = false, limit = 20, cursor } = params;
    const take = Math.min(limit, 50);

    const where: any = { userId, tenantId };
    if (unreadOnly) {
      where.isRead = false;
    }

    const findManyArgs: any = {
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    };

    if (cursor) {
      findManyArgs.cursor = { id: cursor };
      findManyArgs.skip = 1;
    }

    const notifications: NotificationRecord[] = await (this.prisma as any).notification.findMany(findManyArgs);

    let nextCursor: string | undefined;
    if (notifications.length > take) {
      const last = notifications.pop();
      nextCursor = last?.id;
    }

    return { notifications, nextCursor };
  }

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    // Scoped to userId to prevent cross-user access
    await (this.prisma as any).notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string, tenantId: string): Promise<void> {
    await (this.prisma as any).notification.updateMany({
      where: { userId, tenantId, isRead: false },
      data: { isRead: true },
    });
  }

  async getUnreadCount(userId: string, tenantId: string): Promise<number> {
    return (this.prisma as any).notification.count({
      where: { userId, tenantId, isRead: false },
    });
  }
}
