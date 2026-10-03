import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { PrismaService } from '../../shared/prisma.service';
import { CouplesService } from '../couples/couples.service';
import { ChatGateway } from '../realtime/chat.gateway';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const storyVideoTypes = new Set(['video/webm', 'video/mp4', 'video/quicktime']);

function normalizedMimeType(mimeType: string) {
  return mimeType.split(';', 1)[0].trim().toLowerCase();
}

function extensionFor(mimeType: string) {
  const type = normalizedMimeType(mimeType);
  if (type === 'image/jpeg') return '.jpg';
  if (type === 'image/png') return '.png';
  if (type === 'image/webp') return '.webp';
  if (type === 'video/mp4' || type === 'video/quicktime') return '.mp4';
  if (type === 'video/webm') return '.webm';
  return '.bin';
}

function validImage(file: Express.Multer.File) {
  const bytes = file.buffer;
  const type = normalizedMimeType(file.mimetype);
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

function validVideo(file: Express.Multer.File) {
  const bytes = file.buffer;
  const type = normalizedMimeType(file.mimetype);
  if (type === 'video/webm') return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (type === 'video/mp4' || type === 'video/quicktime') return bytes.toString('ascii', 4, 8) === 'ftyp';
  return false;
}

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService, private readonly couples: CouplesService, private readonly realtime: ChatGateway) {}

  private get driver() {
    return process.env.STORAGE_DRIVER || 'local';
  }

  async saveObject(path: string, mimeType: string, data: Buffer) {
    if (this.driver === 'supabase') {
      const base = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVER_KEY;
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'story-images';
      if (!base || !key) throw new ServiceUnavailableException('Storage chưa được cấu hình.');
      const response = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': mimeType, 'x-upsert': 'false' },
        body: new Blob([new Uint8Array(data)], { type: mimeType }),
      });
      if (!response.ok) {
        console.error(`Supabase storage upload failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
        throw new ServiceUnavailableException('Không tải được tệp lên kho lưu trữ.');
      }
      return;
    }
    const fullPath = this.localPath(path);
    await mkdir(resolve(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, data, { flag: 'wx' });
  }

  async removeObject(path: string) {
    if (this.driver === 'supabase') {
      const base = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVER_KEY;
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'story-images';
      if (!base || !key) return;
      await fetch(`${base}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [path] }),
      });
      return;
    }
    try { await unlink(this.localPath(path)); } catch { /* File may have been removed already. */ }
  }

  async readObject(path: string) {
    if (this.driver === 'supabase') {
      const base = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVER_KEY;
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'story-images';
      if (!base || !key) throw new ServiceUnavailableException('Storage chưa được cấu hình.');
      const signed = await fetch(`${base}/storage/v1/object/sign/${bucket}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 60 }),
      });
      if (!signed.ok) throw new NotFoundException('Không tìm thấy tệp.');
      const result = await signed.json() as { signedURL: string };
      const image = await fetch(result.signedURL.startsWith('http') ? result.signedURL : `${base}/storage/v1${result.signedURL}`);
      if (!image.ok) throw new NotFoundException('Không tìm thấy tệp.');
      return Buffer.from(await image.arrayBuffer());
    }
    try { return await readFile(this.localPath(path)); }
    catch { throw new NotFoundException('Không tìm thấy tệp.'); }
  }

  async upload(file: Express.Multer.File, ownerId: string, kind: 'AVATAR' | 'STORY', storyEntryId?: string) {
    this.validateUpload(file, kind);
    const mimeType = normalizedMimeType(file.mimetype);
    const storagePath = `${kind === 'AVATAR' ? 'avatars' : 'stories'}/${ownerId}/${randomUUID()}${extensionFor(mimeType)}`;
    await this.saveObject(storagePath, mimeType, file.buffer);
    try {
      return await this.prisma.media.create({ data: { ownerId, kind, storyEntryId, storagePath, mimeType, byteSize: file.size } });
    } catch (error) {
      await this.removeObject(storagePath);
      throw error;
    }
  }

  async setChatBackground(file: Express.Multer.File, userId: string) {
    this.validateUpload(file, 'CHAT_BACKGROUND');
    const member = await this.couples.requireCouple(userId);
    const mimeType = normalizedMimeType(file.mimetype);
    const storagePath = `chat-backgrounds/${member.coupleId}/${randomUUID()}${extensionFor(mimeType)}`;
    await this.saveObject(storagePath, mimeType, file.buffer);

    let uploaded;
    try {
      uploaded = await this.prisma.media.create({
        data: { ownerId: userId, kind: 'CHAT_BACKGROUND', storagePath, mimeType, byteSize: file.size },
      });
    } catch (error) {
      await this.removeObject(storagePath);
      throw error;
    }

    const current = await this.prisma.couple.findUnique({ where: { id: member.coupleId }, select: { chatBackgroundMediaId: true } });
    try {
      await this.prisma.couple.update({ where: { id: member.coupleId }, data: { chatBackgroundMediaId: uploaded.id } });
    } catch (error) {
      await this.prisma.media.delete({ where: { id: uploaded.id } });
      await this.removeObject(storagePath);
      throw error;
    }

    if (current?.chatBackgroundMediaId) await this.removeMedia(current.chatBackgroundMediaId);
    this.realtime.emitWorkspaceChanged(member.coupleId);
    return { ok: true, imageUrl: `/api/media/${uploaded.id}` };
  }

  async clearChatBackground(userId: string) {
    const member = await this.couples.requireCouple(userId);
    const current = await this.prisma.couple.findUnique({ where: { id: member.coupleId }, select: { chatBackgroundMediaId: true } });
    if (!current?.chatBackgroundMediaId) return { ok: true };
    await this.prisma.couple.update({ where: { id: member.coupleId }, data: { chatBackgroundMediaId: null } });
    await this.removeMedia(current.chatBackgroundMediaId);
    this.realtime.emitWorkspaceChanged(member.coupleId);
    return { ok: true };
  }

  private async removeMedia(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id }, select: { storagePath: true } });
    if (!media) return;
    await this.prisma.media.delete({ where: { id } });
    await this.removeObject(media.storagePath);
  }

  validateUpload(file: Express.Multer.File, kind: 'AVATAR' | 'STORY' | 'CHAT_BACKGROUND') {
    const type = normalizedMimeType(file?.mimetype || '');
    const isImage = imageTypes.has(type);
    const isVideo = kind === 'STORY' && storyVideoTypes.has(type);
    const maxSizeMb = kind === 'AVATAR' ? 5 : kind === 'STORY' ? 25 : 10;
    const validContent = isImage ? validImage(file) : isVideo ? validVideo(file) : false;
    if (!file || file.size < 1 || file.size > maxSizeMb * 1024 * 1024 || (!isImage && !isVideo) || !validContent) {
      throw new ForbiddenException(kind === 'STORY'
        ? 'Tệp cần là ảnh JPEG, PNG, WebP hoặc video WebM/MP4 hợp lệ và đúng giới hạn dung lượng.'
        : 'Ảnh cần là JPEG, PNG hoặc WebP và đúng giới hạn dung lượng.');
    }
  }

  async readForUser(mediaId: string, userId: string) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      include: { storyEntry: { include: { story: true } } },
    });
    if (!media) throw new NotFoundException('Không tìm thấy tệp.');
    if (media.kind === 'CHAT_BACKGROUND') {
      const member = await this.couples.requireCouple(userId);
      const activeBackground = await this.prisma.couple.findFirst({ where: { id: member.coupleId, chatBackgroundMediaId: media.id }, select: { id: true } });
      if (!activeBackground) throw new NotFoundException('Không tìm thấy tệp.');
    } else if (media.ownerId !== userId) {
      if (media.kind === 'AVATAR') {
        const sameWorkspace = await this.prisma.coupleMember.findFirst({
          where: { userId, couple: { members: { some: { userId: media.ownerId } } } },
        });
        if (!sameWorkspace) throw new NotFoundException('Không tìm thấy tệp.');
      } else {
        const member = await this.couples.requireCouple(userId);
        if (media.storyEntry?.story.coupleId !== member.coupleId || media.storyEntry.story.status !== 'PUBLISHED') {
          throw new NotFoundException('Không tìm thấy tệp.');
        }
      }
    }
    return { data: await this.readObject(media.storagePath), mimeType: media.mimeType };
  }

  private localPath(path: string) {
    const root = resolve(__dirname, '../../../../', process.env.LOCAL_MEDIA_DIR || '.local-media');
    const target = resolve(root, path);
    if (!target.startsWith(`${root}/`) && !target.startsWith(`${root}\\`)) throw new ForbiddenException('Đường dẫn ảnh không hợp lệ.');
    return target;
  }
}
