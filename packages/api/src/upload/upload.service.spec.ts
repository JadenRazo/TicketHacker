import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UploadService', () => {
  let service: UploadService;

  const mockPrisma = {
    attachment: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
    jest.clearAllMocks();
  });

  describe('saveUpload', () => {
    const mockFile = (overrides?: Partial<Express.Multer.File>) => ({
      fieldname: 'file',
      originalname: 'test.png',
      encoding: '7bit',
      mimetype: 'image/png',
      destination: '/tmp/uploads/tenant-1',
      filename: 'uuid-test.png',
      path: '/tmp/uploads/tenant-1/uuid-test.png',
      size: 1024,
      stream: null as any,
      buffer: null as any,
      ...overrides,
    });

    it('should reject disallowed MIME types', async () => {
      const file = mockFile({ mimetype: 'application/javascript', path: '/tmp/fake.js' });

      await expect(service.saveUpload('tenant-1', file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject files exceeding size limit', async () => {
      const file = mockFile({ size: 20 * 1024 * 1024 });

      await expect(service.saveUpload('tenant-1', file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if messageId does not belong to tenant', async () => {
      const file = mockFile();
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        tenantId: 'other-tenant',
      });

      await expect(
        service.saveUpload('tenant-1', file, 'msg-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create attachment record for valid upload', async () => {
      const file = mockFile();
      mockPrisma.attachment.create.mockResolvedValue({
        id: 'att-1',
        filename: 'test.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        url: '/uploads/tenant-1/uuid-test.png',
      });

      const result = await service.saveUpload('tenant-1', file);

      expect(result.id).toBe('att-1');
      expect(mockPrisma.attachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            mimeType: 'image/png',
          }),
        }),
      );
    });
  });

  describe('resolveFilePath', () => {
    it('should return null for path traversal attempts', () => {
      expect(service.resolveFilePath('tenant-1', '../etc/passwd')).toBeNull();
      expect(service.resolveFilePath('tenant-1', 'file/../../etc/passwd')).toBeNull();
      expect(service.resolveFilePath('tenant-1', '..\\windows\\system32')).toBeNull();
    });
  });

  describe('linkAttachmentsToMessage', () => {
    it('should skip when no attachment IDs provided', async () => {
      await service.linkAttachmentsToMessage('tenant-1', [], 'msg-1');

      expect(mockPrisma.attachment.updateMany).not.toHaveBeenCalled();
    });

    it('should update attachments with messageId', async () => {
      mockPrisma.attachment.updateMany.mockResolvedValue({ count: 2 });

      await service.linkAttachmentsToMessage(
        'tenant-1',
        ['att-1', 'att-2'],
        'msg-1',
      );

      expect(mockPrisma.attachment.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['att-1', 'att-2'] },
          tenantId: 'tenant-1',
          messageId: null,
        },
        data: { messageId: 'msg-1' },
      });
    });
  });
});
