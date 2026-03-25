import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (existingTenant) {
      throw new ConflictException('Organization slug already taken');
    }

    const passwordHash = await argon2.hash(dto.password);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.organizationName,
        slug: dto.slug,
        users: {
          create: {
            email: dto.email,
            name: dto.name,
            role: 'OWNER',
            passwordHash,
          },
        },
      },
      include: { users: true },
    });

    const user = tenant.users[0];
    return this.generateTokens(user.id, tenant.id, user.email, user.role);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
      include: { tenant: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive)
      throw new UnauthorizedException('Account is deactivated');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    return this.generateTokens(
      user.id,
      user.tenantId,
      user.email,
      user.role,
    );
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || !user.isActive)
        throw new UnauthorizedException('Invalid token');
      return this.generateTokens(
        user.id,
        user.tenantId,
        user.email,
        user.role,
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private generateTokens(
    userId: string,
    tenantId: string,
    email: string,
    role: string,
  ) {
    const payload = { sub: userId, tenantId, email, role };
    return {
      accessToken: this.jwt.sign(payload),
      refreshToken: this.jwt.sign(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '30d'),
      }),
      user: { id: userId, tenantId, email, role },
    };
  }
}
