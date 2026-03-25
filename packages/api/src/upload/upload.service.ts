import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

export interface AttachmentResponse {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  // Allowlist of MIME types accepted for upload
  private readonly ALLOWED_MIME_TYPES = new Set([
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Archives
    'application/zip',
    'application/x-zip-compressed',
  ]);

  private readonly MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

  // Base directory for uploads — two levels up from dist/src, landing at project root/uploads
  private readonly uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates and persists an uploaded file, then creates an Attachment record.
   * The attachment is created without a messageId; callers must link it to a
   * message by passing the returned id in attachmentIds when creating a message.
   */
  async saveUpload(
    tenantId: string,
    file: Express.Multer.File,
    messageId?: string,
  ): Promise<AttachmentResponse> {
    if (!this.ALLOWED_MIME_TYPES.has(file.mimetype)) {
      // Clean up the file multer already wrote to disk
      this.cleanupFile(file.path);
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. Accepted types: images, PDFs, Word documents, spreadsheets, text files, and ZIP archives.`,
      );
    }

    if (file.size > this.MAX_FILE_SIZE_BYTES) {
      this.cleanupFile(file.path);
      throw new BadRequestException('File size exceeds the 10 MB limit.');
    }

    // If a messageId was provided, confirm it exists and belongs to this tenant
    if (messageId) {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, tenantId: true },
      });
      if (!message || message.tenantId !== tenantId) {
        this.cleanupFile(file.path);
        throw new NotFoundException('Message not found.');
      }
    }

    // The file has been stored at file.path by multer's diskStorage.
    // Build the public URL the client will use to retrieve it.
    const relativePath = path.relative(this.uploadsRoot, file.path);
    // relativePath is like "{tenantId}/{uuid}-{originalname}"
    const publicUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;

    const attachment = await this.prisma.attachment.create({
      data: {
        tenantId,
        messageId: messageId ?? null,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        url: publicUrl,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        url: true,
      },
    });

    this.logger.log(
      `Attachment ${attachment.id} created for tenant ${tenantId} (${file.originalname}, ${file.size} bytes)`,
    );

    return attachment;
  }

  /**
   * Resolves the absolute path on disk for a given tenant-scoped filename.
   * Returns null if the file does not exist, letting the controller handle 404.
   */
  resolveFilePath(tenantId: string, filename: string): string | null {
    // Prevent path traversal — filename must not contain directory separators
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return null;
    }
    const filePath = path.join(this.uploadsRoot, tenantId, filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return filePath;
  }

  /**
   * Associates a set of pending (messageId=null) attachments with a message.
   * Called from MessageService after a message is created.
   */
  async linkAttachmentsToMessage(
    tenantId: string,
    attachmentIds: string[],
    messageId: string,
  ): Promise<void> {
    if (!attachmentIds.length) return;

    await this.prisma.attachment.updateMany({
      where: {
        id: { in: attachmentIds },
        tenantId,
        messageId: null,
      },
      data: { messageId },
    });
  }

  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      this.logger.warn(`Failed to clean up file at ${filePath}: ${String(err)}`);
    }
  }
}
