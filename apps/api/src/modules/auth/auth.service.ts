import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { createToken, hashPassword, hashToken, verifyPassword } from '../../shared/security';
import { CredentialsDto, RegisterDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Tài khoản email này đã tồn tại.');
    const user = await this.prisma.user.create({
      data: { email, passwordHash: await hashPassword(dto.password), displayName: dto.displayName.trim() },
    });
    return { user, token: await this.createSession(user.id) };
  }

  async login(dto: CredentialsDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu chưa đúng.');
    }
    return { user, token: await this.createSession(user.id) };
  }

  async logout(token?: string) {
    if (token) await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, currentToken?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw new UnauthorizedException('Mật khẩu hiện tại chưa đúng.');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
    await this.prisma.session.deleteMany({ where: { userId, tokenHash: { not: currentToken ? hashToken(currentToken) : '' } } });
    return { ok: true };
  }

  private async createSession(userId: string) {
    const token = createToken();
    await this.prisma.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    return token;
  }
}
