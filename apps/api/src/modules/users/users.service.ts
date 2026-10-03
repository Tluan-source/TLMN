import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { MediaService } from '../media/media.service';
import { ChatGateway } from '../realtime/chat.gateway';
import { UpdateProfileDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly media: MediaService, private readonly realtime: ChatGateway) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    return this.present(user);
  }

  async update(userId: string, dto: UpdateProfileDto) {
    const data: { displayName?: string; bio?: string | null; gender?: 'UNSPECIFIED' | 'MALE' | 'FEMALE' | 'OTHER'; chatNickname?: string | null; chatIcon?: string } = {};
    if (dto.displayName !== undefined) {
      const displayName = dto.displayName.trim();
      if (!displayName) throw new NotFoundException('Tên hiển thị không được để trống.');
      data.displayName = displayName;
    }
    if (dto.bio !== undefined) data.bio = dto.bio?.trim() || null;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.chatNickname !== undefined) data.chatNickname = dto.chatNickname?.trim() || null;
    if (dto.chatIcon !== undefined) data.chatIcon = dto.chatIcon;
    const user = await this.prisma.user.update({ where: { id: userId }, data });
    await this.emitWorkspaceChanged(userId);
    return this.present(user);
  }

  async setAvatar(userId: string, file: Express.Multer.File) {
    const oldUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!oldUser) throw new NotFoundException('Không tìm thấy tài khoản.');
    const newMedia = await this.media.upload(file, userId, 'AVATAR');
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { avatarMediaId: newMedia.id } });
      await this.emitWorkspaceChanged(userId);
    } catch (error) {
      await this.removeMedia(newMedia.id).catch(() => undefined);
      throw error;
    }
    if (oldUser.avatarMediaId) await this.removeMedia(oldUser.avatarMediaId);
    return this.getMe(userId);
  }

  async clearAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    await this.prisma.user.update({ where: { id: userId }, data: { avatarMediaId: null } });
    await this.emitWorkspaceChanged(userId);
    if (user.avatarMediaId) await this.removeMedia(user.avatarMediaId);
    return this.present({ ...user, avatarMediaId: null });
  }

  async getWorkspaceProfile(viewerId: string, userId: string) {
    const member = await this.prisma.coupleMember.findUnique({ where: { userId: viewerId } });
    if (!member) throw new NotFoundException('Không tìm thấy profile trong workspace này.');
    const target = await this.prisma.coupleMember.findFirst({
      where: { coupleId: member.coupleId, userId },
      include: { user: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy profile trong workspace này.');
    return this.present(target.user);
  }

  private present(user: { id: string; email: string; displayName: string; bio: string | null; gender: 'UNSPECIFIED' | 'MALE' | 'FEMALE' | 'OTHER'; chatNickname: string | null; chatIcon: string; avatarMediaId: string | null }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      gender: user.gender,
      chatNickname: user.chatNickname,
      chatIcon: user.chatIcon,
      avatarUrl: user.avatarMediaId ? `/api/media/${user.avatarMediaId}` : null,
    };
  }

  private async removeMedia(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) return;
    await this.media.removeObject(media.storagePath);
    await this.prisma.media.delete({ where: { id } });
  }

  private async emitWorkspaceChanged(userId: string) {
    try {
      const membership = await this.prisma.coupleMember.findUnique({ where: { userId }, select: { coupleId: true } });
      if (membership) this.realtime.emitWorkspaceChanged(membership.coupleId);
    } catch { /* Realtime updates must not block profile changes. */ }
  }
}
