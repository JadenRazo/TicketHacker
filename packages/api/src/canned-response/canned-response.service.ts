import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCannedResponseDto } from './dto/create-canned-response.dto';
import { UpdateCannedResponseDto } from './dto/update-canned-response.dto';
import { CannedResponseScope } from '@prisma/client';

@Injectable()
export class CannedResponseService {
  constructor(private prisma: PrismaService) {}

  async create(
    tenantId: string,
    userId: string,
    dto: CreateCannedResponseDto,
  ) {
    return this.prisma.cannedResponse.create({
      data: {
        tenantId,
        title: dto.title,
        content: dto.content,
        shortcut: dto.shortcut,
        scope: dto.scope || CannedResponseScope.TENANT,
        ownerId: dto.scope === CannedResponseScope.PERSONAL ? userId : null,
        teamId: dto.teamId,
      },
    });
  }

  async findAll(tenantId: string, userId: string) {
    const userTeams = await this.prisma.teamMember.findMany({
      where: { userId, tenantId },
      select: { teamId: true },
    });

    const teamIds = userTeams.map((tm) => tm.teamId);

    const responses = await this.prisma.cannedResponse.findMany({
      where: {
        tenantId,
        OR: [
          { scope: CannedResponseScope.TENANT },
          { scope: CannedResponseScope.PERSONAL, ownerId: userId },
          {
            scope: CannedResponseScope.TEAM,
            teamId: { in: teamIds },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return responses;
  }

  async search(tenantId: string, userId: string, query: string) {
    const userTeams = await this.prisma.teamMember.findMany({
      where: { userId, tenantId },
      select: { teamId: true },
    });

    const teamIds = userTeams.map((tm) => tm.teamId);

    const responses = await this.prisma.cannedResponse.findMany({
      where: {
        tenantId,
        OR: [
          { scope: CannedResponseScope.TENANT },
          { scope: CannedResponseScope.PERSONAL, ownerId: userId },
          {
            scope: CannedResponseScope.TEAM,
            teamId: { in: teamIds },
          },
        ],
        AND: [
          {
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { content: { contains: query, mode: 'insensitive' } },
              { shortcut: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      orderBy: { usageCount: 'desc' },
      take: 20,
    });

    return responses;
  }

  async findOne(tenantId: string, id: string) {
    const response = await this.prisma.cannedResponse.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!response || response.tenantId !== tenantId) {
      throw new NotFoundException('Canned response not found');
    }

    return response;
  }

  async update(tenantId: string, id: string, dto: UpdateCannedResponseDto) {
    const response = await this.prisma.cannedResponse.findUnique({
      where: { id },
    });

    if (!response || response.tenantId !== tenantId) {
      throw new NotFoundException('Canned response not found');
    }

    return this.prisma.cannedResponse.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.content && { content: dto.content }),
        ...(dto.shortcut !== undefined && { shortcut: dto.shortcut }),
        ...(dto.scope && { scope: dto.scope }),
        ...(dto.teamId !== undefined && { teamId: dto.teamId }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const response = await this.prisma.cannedResponse.findUnique({
      where: { id },
    });

    if (!response || response.tenantId !== tenantId) {
      throw new NotFoundException('Canned response not found');
    }

    await this.prisma.cannedResponse.delete({
      where: { id },
    });

    return { message: 'Canned response deleted successfully' };
  }
}
