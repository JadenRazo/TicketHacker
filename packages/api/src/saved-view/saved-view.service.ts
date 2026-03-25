import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { UpdateSavedViewDto } from './dto/update-saved-view.dto';

@Injectable()
export class SavedViewService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateSavedViewDto) {
    if (dto.isDefault) {
      await this.prisma.savedView.updateMany({
        where: { tenantId, userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedView.create({
      data: {
        tenantId,
        userId,
        name: dto.name,
        filters: dto.filters,
        sortBy: dto.sortBy || 'createdAt',
        sortOrder: dto.sortOrder || 'desc',
        isDefault: dto.isDefault || false,
      },
    });
  }

  async findAll(tenantId: string, userId: string) {
    return this.prisma.savedView.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    tenantId: string,
    userId: string,
    viewId: string,
    dto: UpdateSavedViewDto,
  ) {
    const view = await this.prisma.savedView.findUnique({
      where: { id: viewId },
    });

    if (!view || view.tenantId !== tenantId || view.userId !== userId) {
      throw new NotFoundException('Saved view not found');
    }

    if (dto.isDefault) {
      await this.prisma.savedView.updateMany({
        where: { tenantId, userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedView.update({
      where: { id: viewId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.filters && { filters: dto.filters }),
        ...(dto.sortBy && { sortBy: dto.sortBy }),
        ...(dto.sortOrder && { sortOrder: dto.sortOrder }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  async remove(tenantId: string, userId: string, viewId: string) {
    const view = await this.prisma.savedView.findUnique({
      where: { id: viewId },
    });

    if (!view || view.tenantId !== tenantId || view.userId !== userId) {
      throw new NotFoundException('Saved view not found');
    }

    await this.prisma.savedView.delete({
      where: { id: viewId },
    });

    return { message: 'Saved view deleted successfully' };
  }
}
