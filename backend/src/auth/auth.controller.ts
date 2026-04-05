import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService, REFRESH_COOKIE_NAME } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto.email, dto.password, dto.name, this.getSessionMeta(req));
    this.setRefreshCookie(res, result.refreshToken);
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto.email, dto.password, this.getSessionMeta(req));
    this.setRefreshCookie(res, result.refreshToken);
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    return { message: 'Redirecting to Google' };
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request & { user: { providerId: string; email: string; name?: string } },
    @Res() res: Response,
  ) {
    const result = await this.authService.loginWithGoogle(req.user, this.getSessionMeta(req));
    this.setRefreshCookie(res, result.refreshToken);
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const url = `${frontend}/auth/callback?accessToken=${encodeURIComponent(result.accessToken)}&email=${encodeURIComponent(result.user.email)}&id=${encodeURIComponent(result.user.id)}&name=${encodeURIComponent(result.user.name ?? '')}`;
    return res.redirect(url);
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const result = await this.authService.refresh(token ?? '', this.getSessionMeta(req));
    this.setRefreshCookie(res, result.refreshToken);
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser('userId') userId: string,
    @CurrentUser('sessionId') sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
    return this.authService.logout(userId, sessionId);
  }

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...this.cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    };
  }

  private getSessionMeta(req: Request) {
    return {
      userAgent: req.get('user-agent') ?? undefined,
      ipAddress: req.ip,
    };
  }
}
