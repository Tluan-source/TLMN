import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { entryDays, parseDay, shiftDay } from '../../shared/dates';
import { CouplesService } from '../couples/couples.service';
import { MediaService } from '../media/media.service';
import { ChatGateway } from '../realtime/chat.gateway';

const reactionOptions = ['❤️', '🥰', '😂', '😮', '😢', '🙌'];

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService, private readonly couples: CouplesService, private readonly media: MediaService, private readonly realtime: ChatGateway) {}

  async listCalendar(userId: string, year: number) {
    const member = await this.couples.requireCouple(userId);
    const timezone = await this.timezoneOf(member.coupleId);
    // One day either side of the year: entries written 00:00–03:00 also belong to the previous day.
    const stories = await this.prisma.dailyStory.findMany({
      where: {
        coupleId: member.coupleId,
        status: 'PUBLISHED',
        date: { gte: new Date(Date.UTC(year, 0, 0)), lt: new Date(Date.UTC(year + 1, 0, 2)) },
      },
      select: { date: true, entries: { select: { createdAt: true, media: { select: { id: true, mimeType: true } } } } },
      orderBy: { date: 'desc' },
    });
    const photosByDay = new Map<string, string[]>();
    for (const story of stories) {
      const storyDay = story.date.toISOString().slice(0, 10);
      for (const entry of story.entries) {
        const photos = entry.media.filter((photo) => photo.mimeType.startsWith('image/')).map((photo) => photo.id);
        for (const date of entryDays(storyDay, entry.createdAt, timezone)) {
          if (Number(date.slice(0, 4)) !== year) continue;
          photosByDay.set(date, [...(photosByDay.get(date) || []), ...photos]);
        }
      }
    }
    return Array.from(photosByDay, ([date, photos]) => ({
      date,
      coverUrl: photos.length ? `/api/media/${photos[Math.floor(Math.random() * photos.length)]}` : null,
    })).sort((left, right) => right.date.localeCompare(left.date));
  }

  /** Every published photo and message of a month, for the recap slideshow. */
  async monthRecap(userId: string, month: string) {
    const member = await this.couples.requireCouple(userId);
    const timezone = await this.timezoneOf(member.coupleId);
    const [year, monthNumber] = month.split('-').map(Number);
    const first = `${month}-01`;
    const last = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    const stories = await this.prisma.dailyStory.findMany({
      where: { coupleId: member.coupleId, status: 'PUBLISHED', date: { gte: parseDay(shiftDay(first, -1)), lte: parseDay(shiftDay(last, 1)) } },
      include: {
        author: { select: { id: true, displayName: true, chatNickname: true, chatIcon: true } },
        entries: { orderBy: { createdAt: 'asc' }, include: { media: { select: { id: true, mimeType: true } }, reactions: { select: { userId: true } } } },
        comments: { select: { authorId: true } },
      },
    });
    const photos: { id: string; url: string; date: string; createdAt: string; authorId: string; caption: string }[] = [];
    const days = new Set<string>();
    const people = new Map<string, { id: string; name: string; icon: string; messages: number; photos: number; replies: number; reactions: number }>();
    const person = (author: { id: string; displayName: string; chatNickname: string | null; chatIcon: string }) => {
      if (!people.has(author.id)) people.set(author.id, { id: author.id, name: author.chatNickname?.trim() || author.displayName, icon: author.chatIcon, messages: 0, photos: 0, replies: 0, reactions: 0 });
      return people.get(author.id)!;
    };
    for (const story of stories) {
      const storyDay = story.date.toISOString().slice(0, 10);
      const stats = person(story.author);
      let inMonth = false;
      for (const entry of story.entries) {
        // Count each entry once, under the day it was filed (or its overlap day when filed just outside the month).
        const date = [...entryDays(storyDay, entry.createdAt, timezone)].sort().find((candidate) => candidate.startsWith(month));
        if (!date) continue;
        inMonth = true;
        days.add(date);
        if (entry.content.trim()) stats.messages += 1;
        for (const item of entry.media) {
          if (!item.mimeType.startsWith('image/')) continue;
          stats.photos += 1;
          photos.push({ id: item.id, url: `/api/media/${item.id}`, date, createdAt: entry.createdAt.toISOString(), authorId: story.author.id, caption: entry.content.trim().slice(0, 140) });
        }
        for (const reaction of entry.reactions) {
          const reactor = people.get(reaction.userId);
          if (reactor) reactor.reactions += 1;
        }
      }
      if (!inMonth) continue;
      for (const comment of story.comments) {
        const commenter = people.get(comment.authorId);
        if (commenter) commenter.replies += 1;
      }
    }
    photos.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return { month, days: days.size, photos, people: Array.from(people.values()) };
  }

  async listForDay(userId: string, day: string) {
    const member = await this.couples.requireCouple(userId);
    const date = parseDay(day);
    const timezone = await this.timezoneOf(member.coupleId);
    const stories = await this.prisma.dailyStory.findMany({
      where: { coupleId: member.coupleId, date: { gte: parseDay(shiftDay(day, -1)), lte: parseDay(shiftDay(day, 1)) }, OR: [{ status: 'PUBLISHED' }, { status: 'DRAFT', authorId: userId }] },
      include: {
        author: { select: { id: true, displayName: true, bio: true, chatNickname: true, chatIcon: true, avatarMediaId: true } },
        entries: { orderBy: { createdAt: 'asc' }, include: { media: true, reactions: { select: { userId: true, emoji: true } } } },
        comments: {
          where: { parentId: null },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, displayName: true, bio: true, chatNickname: true, chatIcon: true, avatarMediaId: true } },
            replies: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, displayName: true, bio: true, chatNickname: true, chatIcon: true, avatarMediaId: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return stories
      .map((story) => ({ ...story, entries: this.entriesOnDay(story.date, story.entries, day, timezone) }))
      .filter((story) => story.date.getTime() === date.getTime() || story.entries.length > 0)
      .map((story) => ({
        id: story.id,
        date: story.date.toISOString().slice(0, 10),
        status: story.status,
        author: this.profile(story.author),
        entries: story.entries.map((entry) => ({
          id: entry.id,
          content: entry.content,
          createdAt: entry.createdAt.toISOString(),
          media: entry.media.map((item) => ({ id: item.id, url: `/api/media/${item.id}`, mimeType: item.mimeType })),
          reactions: this.presentReactions(entry.reactions, userId),
        })),
        comments: story.comments.map((comment) => ({
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt.toISOString(),
          author: this.profile(comment.author),
          replies: comment.replies.map((reply) => ({ id: reply.id, content: reply.content, createdAt: reply.createdAt.toISOString(), author: this.profile(reply.author), replies: [] })),
        })),
      }));
  }

  async create(userId: string, dateText: string, content: string | undefined, files: Express.Multer.File[], requestedStatus: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED') {
    const member = await this.couples.requireCouple(userId);
    const date = parseDay(dateText);
    const couple = await this.prisma.couple.findUniqueOrThrow({ where: { id: member.coupleId } });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: couple.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (dateText > today) throw new BadRequestException('Chưa thể viết câu chuyện cho ngày trong tương lai.');
    const text = content?.trim() || '';
    if (!text && files.length === 0) throw new BadRequestException('Viết vài dòng hoặc thêm ảnh trước nhé.');
    if (text.length > 10_000) throw new BadRequestException('Mỗi đoạn chia sẻ tối đa 10.000 ký tự.');
    if (files.length > 10 || files.reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024) {
      throw new BadRequestException('Mỗi lần đăng tối đa 10 tệp và tổng dung lượng 30 MB.');
    }

    let storyId: string | undefined;
    let entryId: string | undefined;
    let madeStory = false;
    let storyStatus: 'DRAFT' | 'PUBLISHED' = 'DRAFT';
    const mediaIds: string[] = [];
    try {
      let story = await this.prisma.dailyStory.findUnique({ where: { coupleId_authorId_date: { coupleId: member.coupleId, authorId: userId, date } } });
      if (!story) {
        story = await this.prisma.dailyStory.create({ data: { coupleId: member.coupleId, authorId: userId, date, status: 'DRAFT' } });
        madeStory = true;
      }
      storyId = story.id;
      storyStatus = story.status;
      const entry = await this.prisma.storyEntry.create({ data: { storyId: story.id, content: text } });
      entryId = entry.id;
      for (const file of files) {
        const item = await this.media.upload(file, userId, 'STORY', entry.id);
        mediaIds.push(item.id);
      }
      if (requestedStatus === 'PUBLISHED' && storyStatus === 'DRAFT') {
        await this.prisma.dailyStory.update({ where: { id: story.id }, data: { status: 'PUBLISHED' } });
      }
    } catch (error: any) {
      const uploaded = await this.prisma.media.findMany({ where: { id: { in: mediaIds } } });
      await Promise.all(uploaded.map((item) => this.media.removeObject(item.storagePath)));
      await this.prisma.media.deleteMany({ where: { id: { in: mediaIds } } });
      if (entryId) await this.prisma.storyEntry.deleteMany({ where: { id: entryId } });
      if (madeStory && storyId) await this.prisma.dailyStory.deleteMany({ where: { id: storyId } });
      if (error?.code === 'P2002') throw new BadRequestException('Câu chuyện vừa được tạo ở nơi khác. Hãy tải lại trang.');
      throw error;
    }
    const result = await this.getOne(userId, storyId!);
    if (result?.status === 'PUBLISHED') this.realtime.emitStoryChanged(member.coupleId, userId, dateText);
    return result;
  }

  async publish(userId: string, storyId: string) {
    const story = await this.requireStory(userId, storyId);
    if (story.authorId !== userId) throw new ForbiddenException('Chỉ người viết mới đăng được bản nháp này.');
    if (story.status === 'PUBLISHED') return this.getOne(userId, storyId);
    const entries = await this.prisma.storyEntry.findMany({ where: { storyId }, include: { media: { select: { id: true } } } });
    if (!entries.some((entry) => entry.content.trim() || entry.media.length > 0)) throw new BadRequestException('Thêm nội dung hoặc ảnh trước khi đăng.');
    await this.prisma.dailyStory.update({ where: { id: storyId }, data: { status: 'PUBLISHED' } });
    this.realtime.emitStoryChanged(story.coupleId, userId, story.date.toISOString());
    return this.getOne(userId, storyId);
  }

  async addEntry(userId: string, storyId: string, content: string | undefined, files: Express.Multer.File[]) {
    const story = await this.requireStory(userId, storyId);
    if (story.authorId !== userId) throw new ForbiddenException('Chỉ người viết mới bổ sung câu chuyện này.');
    const text = content?.trim() || '';
    if (!text && files.length === 0) throw new BadRequestException('Viết vài dòng hoặc thêm ảnh trước khi đăng.');
    if (text.length > 10_000) throw new BadRequestException('Mỗi đoạn chia sẻ tối đa 10.000 ký tự.');
    if (files.length > 10 || files.reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024) throw new BadRequestException('Mỗi lần đăng tối đa 10 tệp và tổng dung lượng 30 MB.');
    const entry = await this.prisma.storyEntry.create({ data: { storyId, content: text } });
    const mediaIds: string[] = [];
    try {
      for (const file of files) mediaIds.push((await this.media.upload(file, userId, 'STORY', entry.id)).id);
    } catch (error) {
      const uploaded = await this.prisma.media.findMany({ where: { id: { in: mediaIds } } });
      await Promise.all(uploaded.map((item) => this.media.removeObject(item.storagePath)));
      await this.prisma.media.deleteMany({ where: { id: { in: mediaIds } } });
      await this.prisma.storyEntry.delete({ where: { id: entry.id } });
      throw error;
    }
    const result = await this.getOne(userId, storyId);
    if (story.status === 'PUBLISHED') this.realtime.emitStoryChanged(story.coupleId, userId, story.date.toISOString());
    return result;
  }

  async addComment(userId: string, storyId: string, content: string, parentId?: string) {
    const story = await this.requireStory(userId, storyId);
    if (story.status !== 'PUBLISHED') throw new NotFoundException('Không tìm thấy câu chuyện.');
    const text = content.trim();
    if (!text) throw new BadRequestException('Bình luận không được để trống.');
    if (parentId) {
      const parent = await this.prisma.comment.findFirst({ where: { id: parentId, storyId } });
      if (!parent) throw new NotFoundException('Không tìm thấy bình luận để trả lời.');
      if (parent.parentId) throw new BadRequestException('Chỉ hỗ trợ trả lời bình luận gốc.');
    }
    const comment = await this.prisma.comment.create({ data: { storyId, authorId: userId, parentId, content: text } });
    const result = await this.prisma.comment.findUnique({ where: { id: comment.id }, include: { author: { select: { id: true, displayName: true, bio: true, avatarMediaId: true } } } });
    this.realtime.emitStoryChanged(story.coupleId, userId, story.date.toISOString());
    return result;
  }

  async toggleReaction(userId: string, storyId: string, entryId: string, emoji: string) {
    if (!reactionOptions.includes(emoji)) throw new BadRequestException('Icon thả vào tin nhắn không hợp lệ.');
    const story = await this.requireStory(userId, storyId);
    if (story.status !== 'PUBLISHED') throw new NotFoundException('Không tìm thấy tin nhắn.');
    const entry = await this.prisma.storyEntry.findFirst({ where: { id: entryId, storyId }, select: { id: true } });
    if (!entry) throw new NotFoundException('Không tìm thấy tin nhắn.');
    const where = { entryId_userId: { entryId, userId } };
    const existing = await this.prisma.storyEntryReaction.findUnique({ where });
    if (existing?.emoji === emoji) await this.prisma.storyEntryReaction.delete({ where });
    else await this.prisma.storyEntryReaction.upsert({ where, update: { emoji }, create: { entryId, userId, emoji } });
    this.realtime.emitStoryChanged(story.coupleId, userId, story.date.toISOString());
    return { ok: true };
  }

  async updateComment(userId: string, commentId: string, content: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId }, include: { story: true } });
    if (!comment || (await this.couples.requireCouple(userId)).coupleId !== comment.story.coupleId) throw new NotFoundException('Không tìm thấy bình luận.');
    if (comment.authorId !== userId) throw new ForbiddenException('Chỉ người viết mới sửa được bình luận.');
    const text = content.trim();
    if (!text) throw new BadRequestException('Bình luận không được để trống.');
    const updated = await this.prisma.comment.update({ where: { id: commentId }, data: { content: text } });
    this.realtime.emitStoryChanged(comment.story.coupleId, userId, comment.story.date.toISOString());
    return updated;
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId }, include: { story: true } });
    if (!comment || (await this.couples.requireCouple(userId)).coupleId !== comment.story.coupleId) throw new NotFoundException('Không tìm thấy bình luận.');
    if (comment.authorId !== userId) throw new ForbiddenException('Chỉ người viết mới xóa được bình luận.');
    await this.prisma.comment.delete({ where: { id: commentId } });
    this.realtime.emitStoryChanged(comment.story.coupleId, userId, comment.story.date.toISOString());
    return { ok: true };
  }

  async deleteStory(userId: string, storyId: string) {
    const story = await this.requireStory(userId, storyId);
    if (story.authorId !== userId) throw new ForbiddenException('Chỉ người viết mới xóa được câu chuyện này.');
    const media = await this.prisma.media.findMany({ where: { storyEntry: { storyId } } });
    if (story.status === 'PUBLISHED') {
      await this.prisma.dailySummary.deleteMany({ where: { coupleId: story.coupleId, date: story.date } });
    }
    await this.prisma.dailyStory.delete({ where: { id: storyId } });
    await Promise.all(media.map((item) => this.media.removeObject(item.storagePath)));
    await this.prisma.media.deleteMany({ where: { id: { in: media.map((item) => item.id) } } });
    if (story.status === 'PUBLISHED') this.realtime.emitStoryChanged(story.coupleId, userId, story.date.toISOString());
    return { ok: true };
  }

  async getOne(userId: string, storyId: string) {
    const story = await this.requireStory(userId, storyId);
    const date = story.date.toISOString().slice(0, 10);
    return (await this.listForDay(userId, date)).find((item) => item.id === story.id);
  }

  /** Published stories of a day, each trimmed to the entries inside that day's 27-hour window. */
  async sourcesForDay(coupleId: string, date: Date) {
    const day = date.toISOString().slice(0, 10);
    const timezone = await this.timezoneOf(coupleId);
    const stories = await this.prisma.dailyStory.findMany({
      where: { coupleId, date: { gte: parseDay(shiftDay(day, -1)), lte: parseDay(shiftDay(day, 1)) }, status: 'PUBLISHED' },
      include: { author: { select: { id: true, displayName: true } }, entries: { orderBy: { createdAt: 'asc' }, include: { media: { select: { id: true } } } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    return stories
      .map((story) => ({ ...story, entries: this.entriesOnDay(story.date, story.entries, day, timezone) }))
      .filter((story) => story.entries.length > 0);
  }

  private entriesOnDay<T extends { createdAt: Date }>(storyDate: Date, entries: T[], day: string, timezone: string) {
    const storyDay = storyDate.toISOString().slice(0, 10);
    return entries.filter((entry) => entryDays(storyDay, entry.createdAt, timezone).has(day));
  }

  private async timezoneOf(coupleId: string) {
    const couple = await this.prisma.couple.findUniqueOrThrow({ where: { id: coupleId }, select: { timezone: true } });
    return couple.timezone;
  }

  private async requireStory(userId: string, storyId: string) {
    const member = await this.couples.requireCouple(userId);
    const story = await this.prisma.dailyStory.findFirst({ where: { id: storyId, coupleId: member.coupleId } });
    if (!story) throw new NotFoundException('Không tìm thấy câu chuyện trong workspace này.');
    return story;
  }

  private presentReactions(reactions: { userId: string; emoji: string }[], viewerId: string) {
    const grouped = new Map<string, { count: number; reacted: boolean }>();
    for (const reaction of reactions) {
      const current = grouped.get(reaction.emoji) || { count: 0, reacted: false };
      current.count += 1;
      current.reacted ||= reaction.userId === viewerId;
      grouped.set(reaction.emoji, current);
    }
    return Array.from(grouped, ([emoji, value]) => ({ emoji, ...value }));
  }

  private profile(user: { id: string; displayName: string; bio: string | null; chatNickname: string | null; chatIcon: string; avatarMediaId: string | null }) {
    return { id: user.id, displayName: user.displayName, bio: user.bio, chatNickname: user.chatNickname, chatIcon: user.chatIcon, avatarUrl: user.avatarMediaId ? `/api/media/${user.avatarMediaId}` : null };
  }
}
