import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';

@Injectable()
export class AutomationService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateAutomationDto) {
    return this.prisma.automationRule.create({
      data: {
        tenantId,
        name: dto.name,
        conditions: dto.conditions,
        actions: dto.actions,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        priority: dto.priority || 0,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.automationRule.findMany({
      where: { tenantId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const automation = await this.prisma.automationRule.findUnique({
      where: { id },
    });

    if (!automation || automation.tenantId !== tenantId) {
      throw new NotFoundException('Automation not found');
    }

    return automation;
  }

  async update(tenantId: string, id: string, dto: UpdateAutomationDto) {
    const automation = await this.prisma.automationRule.findUnique({
      where: { id },
    });

    if (!automation || automation.tenantId !== tenantId) {
      throw new NotFoundException('Automation not found');
    }

    return this.prisma.automationRule.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.conditions && { conditions: dto.conditions }),
        ...(dto.actions && { actions: dto.actions }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
      },
    });
  }

  async findActiveByTenant(tenantId: string) {
    return this.prisma.automationRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async remove(tenantId: string, id: string) {
    const automation = await this.prisma.automationRule.findUnique({
      where: { id },
    });

    if (!automation || automation.tenantId !== tenantId) {
      throw new NotFoundException('Automation not found');
    }

    await this.prisma.automationRule.delete({
      where: { id },
    });

    return { message: 'Automation deleted successfully' };
  }
}
