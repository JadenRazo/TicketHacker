import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TicketService } from './ticket.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus } from '@prisma/client';

describe('TicketService', () => {
  let service: TicketService;
  let prisma: Record<string, any>;
  let eventEmitter: EventEmitter2;

  const mockPrisma = {
    ticket: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
    },
    message: {
      updateMany: jest.fn(),
    },
    savedView: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((fn) =>
      fn({
        message: { updateMany: jest.fn() },
        ticket: { update: jest.fn() },
      }),
    ),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<TicketService>(TicketService);
    prisma = mockPrisma;
    eventEmitter = mockEventEmitter as any;
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      subject: 'Test ticket',
      contactId: 'contact-1',
      channel: 'EMAIL' as const,
      priority: 'NORMAL' as const,
    };

    it('should create a ticket and emit event', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: 'contact-1',
        tenantId: 'tenant-1',
      });
      const ticket = { id: 'ticket-1', ...dto, tenantId: 'tenant-1' };
      mockPrisma.ticket.create.mockResolvedValue(ticket);

      const result = await service.create('tenant-1', 'user-1', dto);

      expect(result.id).toBe('ticket-1');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('ticket.created', {
        tenantId: 'tenant-1',
        ticket,
      });
    });

    it('should throw NotFoundException if contact not found', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue(null);

      await expect(service.create('tenant-1', 'user-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if contact belongs to different tenant', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: 'contact-1',
        tenantId: 'other-tenant',
      });

      await expect(service.create('tenant-1', 'user-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('should return the ticket', async () => {
      const ticket = { id: 'ticket-1', tenantId: 'tenant-1' };
      mockPrisma.ticket.findUnique.mockResolvedValue(ticket);

      const result = await service.findOne('tenant-1', 'ticket-1');
      expect(result.id).toBe('ticket-1');
    });

    it('should throw NotFoundException if ticket not found', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      await expect(service.findOne('tenant-1', 'ticket-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if ticket belongs to different tenant', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        tenantId: 'other-tenant',
      });

      await expect(service.findOne('tenant-1', 'ticket-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update status and set resolvedAt for RESOLVED', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        tenantId: 'tenant-1',
        assigneeId: null,
      });
      mockPrisma.ticket.update.mockResolvedValue({
        id: 'ticket-1',
        status: TicketStatus.RESOLVED,
      });

      await service.update('tenant-1', 'ticket-1', {
        status: TicketStatus.RESOLVED,
      });

      const updateCall = mockPrisma.ticket.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe(TicketStatus.RESOLVED);
      expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
    });

    it('should set closedAt for CLOSED status', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        tenantId: 'tenant-1',
        assigneeId: null,
      });
      mockPrisma.ticket.update.mockResolvedValue({
        id: 'ticket-1',
        status: TicketStatus.CLOSED,
      });

      await service.update('tenant-1', 'ticket-1', {
        status: TicketStatus.CLOSED,
      });

      const updateCall = mockPrisma.ticket.update.mock.calls[0][0];
      expect(updateCall.data.closedAt).toBeInstanceOf(Date);
    });

    it('should emit ticket.updated event', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        tenantId: 'tenant-1',
        assigneeId: 'user-1',
      });
      const updated = { id: 'ticket-1', subject: 'Updated' };
      mockPrisma.ticket.update.mockResolvedValue(updated);

      await service.update('tenant-1', 'ticket-1', { subject: 'Updated' });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'ticket.updated',
        expect.objectContaining({
          tenantId: 'tenant-1',
          ticket: updated,
          previousAssigneeId: 'user-1',
        }),
      );
    });
  });

  describe('merge', () => {
    it('should merge source into target and emit event', async () => {
      mockPrisma.ticket.findUnique
        .mockResolvedValueOnce({ id: 'source', tenantId: 'tenant-1' })
        .mockResolvedValueOnce({ id: 'target', tenantId: 'tenant-1' })
        .mockResolvedValueOnce({ id: 'target', tenantId: 'tenant-1' }); // findOne call

      await service.merge('tenant-1', 'source', 'target');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('ticket.merged', {
        tenantId: 'tenant-1',
        sourceId: 'source',
        targetId: 'target',
      });
    });

    it('should throw NotFoundException if source not found', async () => {
      mockPrisma.ticket.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'target', tenantId: 'tenant-1' });

      await expect(
        service.merge('tenant-1', 'source', 'target'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
