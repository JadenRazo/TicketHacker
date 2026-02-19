import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export interface PortalJwtPayload {
  contactId: string;
  tenantId: string;
  type: 'portal';
}

@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing portal token');
    }

    const token = authHeader.slice(7);

    let payload: PortalJwtPayload;
    try {
      payload = this.jwt.verify<PortalJwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired portal token');
    }

    if (payload.type !== 'portal') {
      throw new UnauthorizedException('Token is not a portal token');
    }

    // Attach portal identity to the request for downstream handlers
    (request as any).portalContact = {
      contactId: payload.contactId,
      tenantId: payload.tenantId,
    };

    return true;
  }
}
