import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: Record<string, any>;
  let jwt: JwtService;

  const mockPrisma = {
    tenant: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('mock-token'),
    verify: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '30d',
      };
      return map[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = mockPrisma;
    jwt = mockJwt as any;
    jest.clearAllMocks();
  });

  describe('register', () => {
    const dto = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      organizationName: 'Test Org',
      slug: 'test-org',
    };

    it('should create a tenant and return tokens', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.create.mockResolvedValue({
        id: 'tenant-1',
        users: [{ id: 'user-1', email: dto.email, role: 'OWNER', tenantId: 'tenant-1' }],
      });

      const result = await service.register(dto);

      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
      expect(result.user.email).toBe(dto.email);
      expect(mockPrisma.tenant.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if slug is taken', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'password123' };

    it('should return tokens for valid credentials', async () => {
      const hash = await argon2.hash('password123');
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        tenantId: 'tenant-1',
        role: 'AGENT',
        passwordHash: hash,
        isActive: true,
        tenant: { id: 'tenant-1' },
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.login(dto);

      expect(result.accessToken).toBe('mock-token');
      expect(result.user.id).toBe('user-1');
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const hash = await argon2.hash('different-password');
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        passwordHash: hash,
        isActive: true,
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for deactivated user', async () => {
      const hash = await argon2.hash('password123');
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        passwordHash: hash,
        isActive: false,
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('should return new tokens for valid refresh token', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'test@example.com',
        role: 'AGENT',
        isActive: true,
      });

      const result = await service.refresh('valid-refresh-token');

      expect(result.accessToken).toBe('mock-token');
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(service.refresh('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isActive: false,
      });

      await expect(service.refresh('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
