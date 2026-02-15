import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMacroDto } from './dto/create-macro.dto';
import { UpdateMacroDto } from './dto/update-macro.dto';
import { MacroScope, MessageDirection, MessageType } from '@prisma/client';

@Injectable()
export class MacroService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateMacroDto) {
    return this.prisma.macro.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        actions: dto.actions,
        scope: dto.scope || MacroScope.TENANT,
        ownerId: dto.scope === MacroScope.PERSONAL ? userId : null,
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

    const macros = await this.prisma.macro.findMany({
      where: {
        tenantId,
        OR: [
          { scope: MacroScope.TENANT },
          { scope: MacroScope.PERSONAL, ownerId: userId },
          {
            scope: MacroScope.TEAM,
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

    return macros;
  }

  async findOne(tenantId: string, id: string) {
    const macro = await this.prisma.macro.findUnique({
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

    if (!macro || macro.tenantId !== tenantId) {
      throw new NotFoundException('Macro not found');
    }

    return macro;
  }

  async update(tenantId: string, id: string, dto: UpdateMacroDto) {
    const macro = await this.prisma.macro.findUnique({
      where: { id },
    });

    if (!macro || macro.tenantId !== tenantId) {
      throw new NotFoundException('Macro not found');
    }

    return this.prisma.macro.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.actions && { actions: dto.actions }),
        ...(dto.scope && { scope: dto.scope }),
        ...(dto.teamId !== undefined && { teamId: dto.teamId }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const macro = await this.prisma.macro.findUnique({
      where: { id },
    });

    if (!macro || macro.tenantId !== tenantId) {
      throw new NotFoundException('Macro not found');
    }

    await this.prisma.macro.delete({
      where: { id },
    });

    return { message: 'Macro deleted successfully' };
  }

  async execute(tenantId: string, userId: string, macroId: string, ticketId: string) {
    const macro = await this.prisma.macro.findUnique({
      where: { id: macroId },
    });

    if (!macro || macro.tenantId !== tenantId) {
      throw new NotFoundException('Macro not found');
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    const actions = macro.actions as any[];
    const updateData: any = {};
    const messages: any[] = [];

    for (const action of actions) {
      switch (action.type) {
        case 'set_status':
          updateData.status = action.value;
          break;
        case 'set_priority':
          updateData.priority = action.value;
          break;
        case 'set_assignee':
          updateData.assigneeId = action.value;
          break;
        case 'set_team':
          updateData.teamId = action.value;
          break;
        case 'add_tag':
          if (!updateData.tags) {
            updateData.tags = [...(ticket.tags || [])];
          }
          if (!updateData.tags.includes(action.value)) {
            updateData.tags.push(action.value);
          }
          break;
        case 'remove_tag':
          if (!updateData.tags) {
            updateData.tags = [...(ticket.tags || [])];
          }
          updateData.tags = updateData.tags.filter((tag: string) => tag !== action.value);
          break;
        case 'send_reply':
          messages.push({
            tenantId,
            ticketId,
            senderId: userId,
            direction: MessageDirection.OUTBOUND,
            contentText: action.value,
            messageType: MessageType.TEXT,
          });
          break;
        case 'add_note':
          messages.push({
            tenantId,
            ticketId,
            senderId: userId,
            direction: MessageDirection.OUTBOUND,
            contentText: action.value,
            messageType: MessageType.NOTE,
          });
          break;
        default:
          throw new BadRequestException(`Unknown action type: ${action.type}`);
      }
    }

    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: updateData,
      }),
      ...messages.map((msg) => this.prisma.message.create({ data: msg })),
      this.prisma.macro.update({
        where: { id: macroId },
        data: { usageCount: { increment: 1 } },
      }),
    ]);

    return this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        assignee: true,
        team: true,
        contact: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }
}
