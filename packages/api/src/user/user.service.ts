import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async inviteUser(tenantId: string, dto: InviteUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId,
          email: dto.email,
        },
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const tempPassword = Math.random().toString(36).slice(-12);
    const passwordHash = await argon2.hash(tempPassword);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        name: dto.name,
        role: dto.role,
        passwordHash,
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...user,
      tempPassword,
    };
  }

  async findAll(tenantId: string, cursor?: string, limit: number = 20) {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = users.length > limit;
    const data = hasMore ? users.slice(0, -1) : users;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data,
      nextCursor,
    };
  }

  async findOne(tenantId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        lastSeenAt: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(tenantId: string, userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deactivate(tenantId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { preferences: dto.preferences },
      select: {
        id: true,
        preferences: true,
        updatedAt: true,
      },
    });
  }
}
