import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import * as express from 'express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UploadService } from './upload.service';

// Resolve uploads directory relative to the compiled output location.
// During runtime __dirname is dist/upload, so three levels up gets to project root.
const UPLOADS_ROOT = path.join(__dirname, '..', '..', '..', 'uploads');

@Controller('uploads')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
  @Roles('AGENT')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          // Scope uploads to the tenant to keep directories clean and isolated.
          // The JWT guard populates req.user before multer runs.
          const tenantId = (req as any).user?.tenantId || 'unknown';
          const dest = path.join(UPLOADS_ROOT, tenantId);
          fs.mkdirSync(dest, { recursive: true });
          cb(null, dest);
        },
        filename: (_req, file, cb) => {
          // Prefix with a UUID so filenames are not guessable even without auth.
          const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          cb(null, `${randomUUID()}-${safeName}`);
        },
      }),
      // 10 MB hard cap — service also validates, belt-and-suspenders
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @CurrentUser('tenantId') tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('messageId') messageId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided. Send a multipart/form-data request with field name "file".');
    }

    return this.uploadService.saveUpload(tenantId, file, messageId);
  }

  /**
   * Serves an uploaded file from disk.
   * No authentication is required — filenames are UUID-prefixed so they are
   * not guessable. This makes it easy to embed images in email notifications
   * or preview attachments without needing a token.
   */
  @Get(':tenantId/:filename')
  serveFile(
    @Param('tenantId') tenantId: string,
    @Param('filename') filename: string,
    @Res() res: express.Response,
  ) {
    const filePath = this.uploadService.resolveFilePath(tenantId, filename);

    if (!filePath) {
      throw new NotFoundException('File not found.');
    }

    // Derive the MIME type from the UUID-prefixed filename.
    // The original extension is preserved after the UUID prefix.
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.zip': 'application/zip',
    };

    const contentType = mimeMap[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    const safeInlineTypes = new Set([
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
    ]);
    const disposition = safeInlineTypes.has(contentType) ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=86400');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      this.logger.error(`Failed to stream file ${filePath}: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to read file.' });
      }
    });
    stream.pipe(res);
  }
}
