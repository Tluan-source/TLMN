import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { dateInTimezone, entryDays, shiftDay } from '../../shared/dates';
import { CouplesService } from '../couples/couples.service';

@Injectable()
export class StreaksService {
  constructor(private readonly prisma: PrismaService, private readonly couples: CouplesService) {}

  async current(userId: string) {
    const member = await this.couples.requireCouple(userId);
    const [couple, members] = await Promise.all([
      this.prisma.couple.findUniqueOrThrow({ where: { id: member.coupleId } }),
      this.prisma.coupleMember.findMany({ where: { coupleId: member.coupleId }, select: { userId: true } }),
    ]);
    const today = dateInTimezone(new Date(), couple.timezone);
    const stories = await this.prisma.dailyStory.findMany({
      where: { coupleId: member.coupleId, status: 'PUBLISHED', date: { lte: new Date(`${today}T00:00:00.000Z`) } },
      include: { entries: { include: { media: { select: { id: true } } } } },
    });
    const validByDay = new Map<string, Set<string>>();
    for (const story of stories) {
      const storyDay = story.date.toISOString().slice(0, 10);
      for (const entry of story.entries) {
        if (!entry.content.trim() && entry.media.length === 0) continue;
        // A message sent 00:00–03:00 keeps yesterday's streak alive as well as today's.
        for (const day of entryDays(storyDay, entry.createdAt, couple.timezone)) {
          if (day > today) continue;
          const authors = validByDay.get(day) ?? new Set<string>();
          authors.add(story.authorId);
          validByDay.set(day, authors);
        }
      }
    }
    const completeDays = [...validByDay.entries()]
      .filter(([, authors]) => members.length === 2 && members.every((item) => authors.has(item.userId)))
      .map(([day]) => day)
      .sort();
    const month = today.slice(0, 7);
    const completed = new Set(completeDays);
    const yesterday = shiftDay(today, -1);
    let cursor = completed.has(today) ? today : completed.has(yesterday) ? yesterday : '';
    let current = 0;
    while (cursor && completed.has(cursor)) {
      current += 1;
      cursor = shiftDay(cursor, -1);
    }
    let monthCursor = completed.has(today) ? today : completed.has(yesterday) && yesterday.startsWith(`${month}-`) ? yesterday : '';
    let monthStreakDays = 0;
    while (monthCursor && monthCursor.startsWith(`${month}-`) && completed.has(monthCursor)) {
      monthStreakDays += 1;
      monthCursor = shiftDay(monthCursor, -1);
    }
    let best = 0;
    let run = 0;
    let previous = '';
    for (const day of completeDays) {
      run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
      best = Math.max(best, run);
      previous = day;
    }
    return {
      current,
      best,
      todayComplete: completed.has(today),
      month,
      monthStreakDays,
      progress: Math.min(100, Math.round((monthStreakDays / 30) * 100)),
      target: 30,
    };
  }
}
