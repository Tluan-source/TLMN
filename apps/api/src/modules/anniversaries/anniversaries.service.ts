import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../shared/prisma.service';
import { dateInTimezone, parseDay } from '../../shared/dates';
import { CouplesService } from '../couples/couples.service';
import { ChatGateway } from '../realtime/chat.gateway';
import { CreateAnniversaryDto } from './anniversaries.dto';

type AnniversaryRecord = {
  id: string;
  title: string;
  date: Date;
  note: string | null;
  annual: boolean;
};

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function annualDate(originalDate: string, year: number) {
  const monthDay = originalDate.slice(5);
  if (monthDay === '02-29' && !isLeapYear(year)) return `${year}-02-28`;
  return `${year}-${monthDay}`;
}

function zonedDateTime(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let result = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(result));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const observed = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
    result += desired - observed;
  }
  return new Date(result);
}

@Injectable()
export class AnniversariesService {
  constructor(private readonly prisma: PrismaService, private readonly couples: CouplesService, private readonly realtime: ChatGateway) {}

  async list(userId: string, requestedYear?: string) {
    const member = await this.couples.requireCouple(userId);
    const year = requestedYear ? Number(requestedYear) : new Date().getUTCFullYear();
    if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new BadRequestException('Năm không hợp lệ.');
    const records = await this.prisma.anniversary.findMany({ where: { coupleId: member.coupleId }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    return records
      .filter((record) => record.annual || record.date.toISOString().slice(0, 4) === String(year))
      .map((record) => this.present(record, year));
  }

  async create(userId: string, dto: CreateAnniversaryDto) {
    const member = await this.couples.requireCouple(userId);
    const date = parseDay(dto.date);
    const anniversary = await this.prisma.anniversary.create({
      data: { coupleId: member.coupleId, creatorId: userId, title: dto.title.trim(), date, note: dto.note?.trim() || null, annual: dto.annual ?? true },
    });
    this.realtime.emitWorkspaceChanged(member.coupleId);
    return this.present(anniversary, Number(dto.date.slice(0, 4)));
  }

  async remove(userId: string, id: string) {
    const member = await this.couples.requireCouple(userId);
    const anniversary = await this.prisma.anniversary.findFirst({ where: { id, coupleId: member.coupleId } });
    if (!anniversary) throw new NotFoundException('Không tìm thấy ngày kỷ niệm.');
    await this.prisma.anniversary.delete({ where: { id } });
    this.realtime.emitWorkspaceChanged(member.coupleId);
    return { ok: true };
  }

  async suggestions(userId: string) {
    const member = await this.couples.requireCouple(userId);
    const [user, couple, records] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { gender: true } }),
      this.prisma.couple.findUniqueOrThrow({ where: { id: member.coupleId }, select: { timezone: true } }),
      this.prisma.anniversary.findMany({ where: { coupleId: member.coupleId }, orderBy: { date: 'asc' } }),
    ]);
    if (user?.gender !== 'MALE') return { eligible: false, suggestions: [] };
    if (!records.length) return { eligible: true, suggestions: [] };

    const now = new Date();
    const localDate = dateInTimezone(now, couple.timezone);
    const candidates = records.map((record) => {
      const originalDate = record.date.toISOString().slice(0, 10);
      const candidateDate = record.annual ? annualDate(originalDate, Number(localDate.slice(0, 4))) : originalDate;
      const nextDate = record.annual && candidateDate < localDate ? annualDate(originalDate, Number(localDate.slice(0, 4)) + 1) : candidateDate;
      return { id: record.id, title: record.title, date: nextDate, note: record.note };
    }).filter((record) => record.date >= localDate).slice(0, 12);
    if (!candidates.length) return { eligible: true, suggestions: [] };

    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;
    if (!apiKey || !model) throw new ServiceUnavailableException('Chưa cấu hình nhà cung cấp AI trong backend.');
    const reserved = await this.reserveAiUsage(member.coupleId, couple.timezone);
    try {
      const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model, temperature: 0.5, max_tokens: 900, response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Bạn là trợ lý nhắc ngày kỷ niệm cho một người dùng nam. Trả đúng JSON dạng {"suggestions":[{"anniversaryId":"...","message":"...","reminderDate":"YYYY-MM-DD hoặc null","reminderTime":"HH:mm hoặc null"}]}. Viết bằng tiếng Việt, gợi ý một hành động nhỏ, chân thành và cụ thể; không định kiến giới, không bịa thông tin. reminderDate và reminderTime phải là tương lai theo múi giờ được cho, ưu tiên nhắc trước ngày kỷ niệm 3-7 ngày lúc 09:00. Chỉ dùng anniversaryId có trong dữ liệu.' },
            { role: 'user', content: `Múi giờ: ${couple.timezone}. Hôm nay: ${localDate}. Các ngày kỷ niệm sắp tới: ${JSON.stringify(candidates)}` },
          ],
        }),
      });
      if (!response.ok) throw new ServiceUnavailableException(`AI chưa tạo được gợi ý (${response.status}).`);
      const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) throw new ServiceUnavailableException('AI chưa đưa ra được gợi ý.');
      const parsed = JSON.parse(content) as { suggestions?: unknown };
      const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const value = item as Record<string, unknown>;
        const anniversaryId = typeof value.anniversaryId === 'string' ? value.anniversaryId : '';
        const candidate = byId.get(anniversaryId);
        const message = typeof value.message === 'string' ? value.message.trim().slice(0, 700) : '';
        if (!candidate || !message) return [];
        const reminderDate = typeof value.reminderDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.reminderDate) ? value.reminderDate : null;
        const reminderTime = typeof value.reminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.reminderTime) ? value.reminderTime : null;
        if (reminderDate && reminderTime && zonedDateTime(reminderDate, reminderTime, couple.timezone) <= now) return [];
        return [{ anniversaryId, title: candidate.title, date: candidate.date, message, reminderDate, reminderTime }];
      }) : [];
      return { eligible: true, suggestions };
    } catch (error) {
      await this.prisma.aiUsage.update({ where: { coupleId_date: { coupleId: member.coupleId, date: reserved.date } }, data: { count: { decrement: 1 } } }).catch(() => undefined);
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('AI chưa thể tạo gợi ý ngày kỷ niệm. Hãy thử lại sau.');
    }
  }

  private present(record: AnniversaryRecord, year: number) {
    const originalDate = record.date.toISOString().slice(0, 10);
    return { id: record.id, title: record.title, date: record.annual ? annualDate(originalDate, year) : originalDate, originalDate, note: record.note, annual: record.annual };
  }

  private async reserveAiUsage(coupleId: string, timezone: string) {
    const date = new Date(`${dateInTimezone(new Date(), timezone)}T00:00:00.000Z`);
    const reserved = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "AiUsage" ("id", "coupleId", "date", "count")
      VALUES (${randomUUID()}, ${coupleId}, ${date}, 1)
      ON CONFLICT ("coupleId", "date") DO UPDATE
      SET "count" = "AiUsage"."count" + 1
      WHERE "AiUsage"."count" < 5
      RETURNING "count"
    `;
    if (!reserved.length) throw new HttpException('Workspace đã dùng hết 5 lượt AI hôm nay.', 429);
    return { date };
  }
}
