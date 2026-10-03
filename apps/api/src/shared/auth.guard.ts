import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from './prisma.service';
import { hashToken } from './security';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; email: string; displayName: string; bio: string | null; gender: 'UNSPECIFIED' | 'MALE' | 'FEMALE' | 'OTHER'; chatNickname: string | null; chatIcon: string; avatarMediaId: string | null };
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.['journal_session'] as string | undefined;
    if (!token) throw new UnauthorizedException('Vui lòng đăng nhập.');
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date()) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn.');
    request.user = session.user;
    return true;
  }
}
