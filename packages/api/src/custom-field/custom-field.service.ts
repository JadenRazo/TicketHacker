import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

@Injectable()
export class CustomFieldService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCustomFieldDto) {
    return this.prisma.customFieldDefinition.create({
      data: {
        tenantId,
        name: dto.name,
        fieldType: dto.fieldType,
        options: dto.options,
        isRequired: dto.isRequired || false,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.customFieldDefinition.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCustomFieldDto) {
    const field = await this.prisma.customFieldDefinition.findUnique({
      where: { id },
    });

    if (!field || field.tenantId !== tenantId) {
      throw new NotFoundException('Custom field not found');
    }

    return this.prisma.customFieldDefinition.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.fieldType && { fieldType: dto.fieldType }),
        ...(dto.options !== undefined && { options: dto.options }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const field = await this.prisma.customFieldDefinition.findUnique({
      where: { id },
    });

    if (!field || field.tenantId !== tenantId) {
      throw new NotFoundException('Custom field not found');
    }

    await this.prisma.customFieldDefinition.delete({
      where: { id },
    });

    return { message: 'Custom field deleted successfully' };
  }
}
