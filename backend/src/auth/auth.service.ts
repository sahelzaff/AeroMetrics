import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuthProvider, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';

export const REFRESH_COOKIE_NAME = 'mcq_refresh_token';

interface SessionMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  async register(email: string, password: string, name: string | undefined, sessionMeta: SessionMeta) {
    const normalizedEmail = email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name,
        authAccounts: {
          create: {
            provider: AuthProvider.LOCAL,
            providerAccountId: normalizedEmail,
          },
        },
      },
    });

    void this.observabilityService.logEvent({
      eventType: 'REGISTER_SUCCESS',
      userId: user.id,
      payload: { email: user.email, provider: 'LOCAL', ipAddress: sessionMeta.ipAddress },
    });

    return this.issueTokenPair(user, undefined, sessionMeta);
  }

  async login(email: string, password: string, sessionMeta: SessionMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user?.passwordHash) {
      void this.observabilityService.logEvent({
        eventType: 'LOGIN_FAILED',
        level: 'warn',
        payload: { email: email.toLowerCase(), reason: 'user_not_found_or_no_password', ipAddress: sessionMeta.ipAddress },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      void this.observabilityService.logEvent({
        eventType: 'LOGIN_FAILED',
        level: 'warn',
        userId: user.id,
        payload: { email: user.email, reason: 'invalid_password', ipAddress: sessionMeta.ipAddress },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    void this.observabilityService.logEvent({
      eventType: 'LOGIN_SUCCESS',
      userId: user.id,
      payload: { email: user.email, provider: 'LOCAL', ipAddress: sessionMeta.ipAddress },
    });

    return this.issueTokenPair(user, undefined, sessionMeta);
  }

  async loginWithGoogle(profile: { providerId: string; email: string; name?: string }, sessionMeta: SessionMeta) {
    if (!profile.email) {
      throw new BadRequestException('Google profile does not include email');
    }

    let user = await this.prisma.user.findUnique({ where: { email: profile.email.toLowerCase() } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email.toLowerCase(),
          name: profile.name,
        },
      });
    }

    void this.observabilityService.logEvent({
      eventType: 'LOGIN_SUCCESS',
      userId: user.id,
      payload: { email: user.email, provider: 'GOOGLE', ipAddress: sessionMeta.ipAddress },
    });

    await this.prisma.authAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: AuthProvider.GOOGLE,
          providerAccountId: profile.providerId,
        },
      },
      update: { userId: user.id },
      create: {
        userId: user.id,
        provider: AuthProvider.GOOGLE,
        providerAccountId: profile.providerId,
      },
    });

    return this.issueTokenPair(user, undefined, sessionMeta);
  }

  async refresh(refreshToken: string, sessionMeta: SessionMeta) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    try {
      const decoded = await this.jwtService.verifyAsync<{ sub: string; sessionId: string; type: string }>(
        refreshToken,
        { secret: this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'replace-me-refresh' },
      );

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const session = await this.prisma.refreshSession.findUnique({ where: { id: decoded.sessionId } });
      if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== decoded.sub) {
        void this.observabilityService.logEvent({
          eventType: 'TOKEN_REFRESH_FAILED',
          level: 'warn',
          userId: decoded.sub,
          sessionId: decoded.sessionId,
          payload: { reason: 'session_invalid_or_expired', ipAddress: sessionMeta.ipAddress },
        });
        throw new UnauthorizedException('Session expired');
      }

      const tokenMatches = await bcrypt.compare(refreshToken, session.tokenHash);
      if (!tokenMatches) {
        void this.observabilityService.logEvent({
          eventType: 'TOKEN_REFRESH_FAILED',
          level: 'warn',
          userId: decoded.sub,
          sessionId: decoded.sessionId,
          payload: { reason: 'token_hash_mismatch', ipAddress: sessionMeta.ipAddress },
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) {
        void this.observabilityService.logEvent({
          eventType: 'TOKEN_REFRESH_FAILED',
          level: 'warn',
          userId: decoded.sub,
          sessionId: decoded.sessionId,
          payload: { reason: 'user_not_found', ipAddress: sessionMeta.ipAddress },
        });
        throw new UnauthorizedException('User not found');
      }

      void this.observabilityService.logEvent({
        eventType: 'TOKEN_REFRESH_SUCCESS',
        userId: user.id,
        sessionId: session.id,
        payload: { email: user.email, ipAddress: sessionMeta.ipAddress },
      });

      return this.issueTokenPair(user, session.id, sessionMeta);
    } catch {
      void this.observabilityService.logEvent({
        eventType: 'TOKEN_REFRESH_FAILED',
        level: 'warn',
        payload: { reason: 'invalid_refresh_token', ipAddress: sessionMeta.ipAddress },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, sessionId: string) {
    if (!sessionId) {
      throw new UnauthorizedException('Missing session id');
    }

    await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    void this.observabilityService.logEvent({
      eventType: 'LOGOUT_SUCCESS',
      userId,
      sessionId,
    });

    return { success: true };
  }

  private async issueTokenPair(user: User, sessionId: string | undefined, sessionMeta: SessionMeta) {
    const resolvedSessionId = sessionId ?? randomUUID();
    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET') ?? 'replace-me-access';
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'replace-me-refresh';
    const accessExpires = this.configService.get<string>('JWT_ACCESS_EXPIRES') ?? '15m';
    const refreshExpires = this.configService.get<string>('JWT_REFRESH_EXPIRES') ?? '7d';

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, sessionId: resolvedSessionId, type: 'access' },
      { secret: accessSecret, expiresIn: accessExpires as never },
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, sessionId: resolvedSessionId, type: 'refresh' },
      { secret: refreshSecret, expiresIn: refreshExpires as never },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + this.parseDurationToMs(refreshExpires));

    await this.prisma.refreshSession.upsert({
      where: { id: resolvedSessionId },
      create: {
        id: resolvedSessionId,
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt,
        ipAddress: sessionMeta.ipAddress,
        userAgent: sessionMeta.userAgent,
        lastUsedAt: new Date(),
      },
      update: {
        tokenHash: refreshTokenHash,
        expiresAt,
        revokedAt: null,
        ipAddress: sessionMeta.ipAddress,
        userAgent: sessionMeta.userAgent,
        lastUsedAt: new Date(),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      accessToken,
      refreshToken,
    };
  }

  private parseDurationToMs(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }

    const value = Number(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
      default:
        return value * 24 * 60 * 60 * 1000;
    }
  }
}

