import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '../../shared/auth.guard';
import { ChatGateway } from '../realtime/chat.gateway';
import { ChangePasswordDto, CredentialsDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly realtime: ChatGateway) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register(dto);
    response.cookie('journal_session', result.token, cookieOptions());
    return this.publicUser(result.user);
  }

  @Post('login')
  async login(@Body() dto: CredentialsDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto);
    response.cookie('journal_session', result.token, cookieOptions());
    return this.publicUser(result.user);
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.['journal_session']);
    response.clearCookie('journal_session', cookieOptions());
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() request: Request) {
    return this.publicUser(request.user!);
  }

  @UseGuards(AuthGuard)
  @Post('realtime-ticket')
  realtimeTicket(@Req() request: Request) {
    return this.realtime.issueTicket(request.user!.id);
  }

  @UseGuards(AuthGuard)
  @Post('password')
  changePassword(@Req() request: Request, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(request.user!.id, dto.currentPassword, dto.newPassword, request.cookies?.['journal_session']);
  }

  private publicUser(user: { id: string; email: string; displayName: string; bio: string | null; gender: 'UNSPECIFIED' | 'MALE' | 'FEMALE' | 'OTHER'; chatNickname: string | null; chatIcon: string; avatarMediaId?: string | null }) {
    return { id: user.id, email: user.email, displayName: user.displayName, bio: user.bio, gender: user.gender, chatNickname: user.chatNickname, chatIcon: user.chatIcon, avatarUrl: user.avatarMediaId ? `/api/media/${user.avatarMediaId}` : null };
  }
}
