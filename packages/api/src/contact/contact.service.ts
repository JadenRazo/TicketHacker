import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { paginateResult } from '../common/utils/paginate';

@Injectable()
export class ContactService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    search?: string,
    cursor?: string,
    limit: number = 20,
  ) {
    const where: any = { tenantId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const contacts = await this.prisma.contact.findMany({
      where,
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        externalId: true,
        name: true,
        email: true,
        avatarUrl: true,
        channel: true,
        satisfactionRating: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { tickets: true },
        },
      },
    });

    return paginateResult(contacts, limit);
  }

  async findOne(tenantId: string, contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        tickets: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            subject: true,
            status: true,
            priority: true,
            channel: true,
            createdAt: true,
            updatedAt: true,
            resolvedAt: true,
            closedAt: true,
          },
        },
      },
    });

    if (!contact || contact.tenantId !== tenantId) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }
}
