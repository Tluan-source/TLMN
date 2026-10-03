import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { createToken, hashToken } from '../../shared/security';
import { ChatGateway } from '../realtime/chat.gateway';

const memberSelect = {
  user: { select: { id: true, displayName: true, bio: true, gender: true, chatNickname: true, chatIcon: true, avatarMediaId: true } },
} as const;

function present(couple: any) {
  if (!couple) return null;
  return {
    id: couple.id,
    name: couple.name,
    timezone: couple.timezone,
    chatBackground: couple.chatBackground,
    chatBackgroundImageUrl: couple.chatBackgroundMediaId ? `/api/media/${couple.chatBackgroundMediaId}` : null,
    members: couple.members.map((member: any) => ({
      id: member.user.id,
      displayName: member.user.displayName,
      bio: member.user.bio,
      gender: member.user.gender,
      chatNickname: member.user.chatNickname,
      chatIcon: member.user.chatIcon,
      avatarUrl: member.user.avatarMediaId ? `/api/media/${member.user.avatarMediaId}` : null,
    })),
  };
}

@Injectable()
export class CouplesService {
  constructor(private readonly prisma: PrismaService, private readonly realtime: ChatGateway) {}

  async current(userId: string) {
    const member = await this.prisma.coupleMember.findUnique({
      where: { userId },
      include: { couple: { include: { members: { include: memberSelect, orderBy: { slot: 'asc' } } } } },
    });
    return { couple: present(member?.couple ?? null) };
  }

  async create(userId: string, name: string) {
    const existing = await this.prisma.coupleMember.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Tài khoản đã thuộc một workspace.');
    const couple = await this.prisma.couple.create({
      data: { name: name.trim(), members: { create: { userId, slot: 1 } } },
      include: { members: { include: memberSelect } },
    });
    return present(couple);
  }

  async updateSettings(userId: string, settings: { name?: string; chatBackground?: string }) {
    const member = await this.prisma.coupleMember.findUnique({ where: { userId } });
    if (!member) throw new NotFoundException('Bạn chưa tạo hoặc tham gia workspace.');
    const data: { name?: string; chatBackground?: string } = {};
    if (settings.name !== undefined) {
      const name = settings.name.trim();
      if (!name) throw new BadRequestException('Tên workspace không được để trống.');
      data.name = name;
    }
    if (settings.chatBackground !== undefined) data.chatBackground = settings.chatBackground;
    if (!Object.keys(data).length) throw new BadRequestException('Chọn cài đặt cần lưu.');
    const couple = await this.prisma.couple.update({
      where: { id: member.coupleId },
      data,
      include: { members: { include: memberSelect, orderBy: { slot: 'asc' } } },
    });
    this.realtime.emitWorkspaceChanged(member.coupleId);
    return present(couple);
  }

  async createInvitation(userId: string) {
    const member = await this.prisma.coupleMember.findUnique({ where: { userId } });
    if (!member) throw new NotFoundException('Hãy tạo workspace trước.');
    const count = await this.prisma.coupleMember.count({ where: { coupleId: member.coupleId } });
    if (count >= 2) throw new ConflictException('Workspace đã có đủ hai người.');
    const token = createToken(24);
    await this.prisma.$transaction([
      this.prisma.invitation.updateMany({ where: { coupleId: member.coupleId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.invitation.create({
        data: { coupleId: member.coupleId, creatorId: userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      }),
    ]);
    return { token, expiresInHours: 24 };
  }

  async acceptInvitation(userId: string, token: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      throw new NotFoundException('Lời mời không tồn tại, đã dùng hoặc đã hết hạn.');
    }
    if (invitation.creatorId === userId) throw new ConflictException('Bạn không thể tự nhận lời mời của mình.');
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.invitation.findUnique({ where: { id: invitation.id } });
        if (!current || current.revokedAt || current.acceptedAt || current.expiresAt <= new Date()) {
          throw new NotFoundException('Lời mời không còn hiệu lực.');
        }
        const joined = await tx.coupleMember.findUnique({ where: { userId } });
        if (joined) throw new ConflictException('Tài khoản đã thuộc một workspace.');
        const count = await tx.coupleMember.count({ where: { coupleId: current.coupleId } });
        if (count !== 1) throw new ConflictException('Workspace không còn chỗ trống.');
        await tx.coupleMember.create({ data: { coupleId: current.coupleId, userId, slot: 2 } });
        await tx.invitation.update({ where: { id: current.id }, data: { acceptedAt: new Date() } });
        await tx.invitation.updateMany({ where: { coupleId: current.coupleId, id: { not: current.id }, acceptedAt: null }, data: { revokedAt: new Date() } });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Tài khoản đã tham gia workspace khác hoặc lời mời vừa được sử dụng.');
      throw error;
    }
    this.realtime.emitWorkspaceChanged(invitation.coupleId);
    return this.current(userId);
  }

  async requireCouple(userId: string) {
    const member = await this.prisma.coupleMember.findUnique({ where: { userId } });
    if (!member) throw new ForbiddenException('Hãy tạo hoặc tham gia một workspace trước.');
    return member;
  }

  async profile(userId: string, targetId: string) {
    const member = await this.requireCouple(userId);
    const target = await this.prisma.coupleMember.findFirst({ where: { coupleId: member.coupleId, userId: targetId }, include: { user: true } });
    if (!target) throw new NotFoundException('Không tìm thấy profile trong workspace này.');
    return { id: target.user.id, displayName: target.user.displayName, bio: target.user.bio, gender: target.user.gender, chatNickname: target.user.chatNickname, chatIcon: target.user.chatIcon, avatarUrl: target.user.avatarMediaId ? `/api/media/${target.user.avatarMediaId}` : null };
  }
}
