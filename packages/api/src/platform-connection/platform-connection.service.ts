import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlatformConnectionDto } from './dto/create-platform-connection.dto';
import { UpdatePlatformConnectionDto } from './dto/update-platform-connection.dto';

@Injectable()
export class PlatformConnectionService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreatePlatformConnectionDto) {
    return this.prisma.platformConnection.upsert({
      where: {
        tenantId_channel: {
          tenantId,
          channel: dto.channel,
        },
      },
      update: {
        config: dto.config,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
      create: {
        tenantId,
        channel: dto.channel,
        config: dto.config,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.platformConnection.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const connection = await this.prisma.platformConnection.findUnique({
      where: { id },
    });

    if (!connection || connection.tenantId !== tenantId) {
      throw new NotFoundException('Platform connection not found');
    }

    return connection;
  }

  async update(tenantId: string, id: string, dto: UpdatePlatformConnectionDto) {
    const connection = await this.prisma.platformConnection.findUnique({
      where: { id },
    });

    if (!connection || connection.tenantId !== tenantId) {
      throw new NotFoundException('Platform connection not found');
    }

    return this.prisma.platformConnection.update({
      where: { id },
      data: {
        ...(dto.config && { config: dto.config }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const connection = await this.prisma.platformConnection.findUnique({
      where: { id },
    });

    if (!connection || connection.tenantId !== tenantId) {
      throw new NotFoundException('Platform connection not found');
    }

    await this.prisma.platformConnection.delete({
      where: { id },
    });

    return { message: 'Platform connection deleted successfully' };
  }
}
