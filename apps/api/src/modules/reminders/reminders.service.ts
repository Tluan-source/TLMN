import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { dateInTimezone } from '../../shared/dates';
import { CouplesService } from '../couples/couples.service';
import { ChatGateway } from '../realtime/chat.gateway';
import { CreateReminderDto, PlanReminderDto } from './reminders.dto';

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
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(private readonly prisma: PrismaService, private readonly couples: CouplesService, private readonly realtime: ChatGateway) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.dispatchDue(), 1_000);
    this.timer.unref?.();
    void this.dispatchDue();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async list(userId: string) {
    const member = await this.couples.requireCouple(userId);
    const reminders = await this.prisma.reminder.findMany({
      where: { coupleId: member.coupleId, status: 'PENDING' },
      orderBy: { scheduledAt: 'asc' },
    });
    return reminders.map((reminder) => this.present(reminder));
  }

  async create(userId: string, dto: CreateReminderDto) {
    const member = await this.couples.requireCouple(userId);
    const couple = await this.prisma.couple.findUniqueOrThrow({ where: { id: member.coupleId } });
    const scheduledAt = zonedDateTime(dto.date, dto.time, couple.timezone);
    if (Number.isNaN(scheduledAt.valueOf()) || scheduledAt <= new Date()) throw new BadRequestException('Chọn thời điểm trong tương lai theo múi giờ workspace.');
    const reminder = await this.prisma.reminder.create({
      data: { coupleId: member.coupleId, creatorId: userId, title: dto.title.trim(), scheduledAt },
    });
    this.realtime.emitRemindersChanged(member.coupleId);
    return this.present(reminder);
  }

  async complete(userId: string, id: string) {
    const reminder = await this.findForMember(userId, id);
    if (reminder.status !== 'PENDING') return this.present(reminder);
    const completed = await this.prisma.reminder.update({ where: { id }, data: { status: 'COMPLETED' } });
    this.realtime.emitRemindersChanged(reminder.coupleId);
    return this.present(completed);
  }

  async remove(userId: string, id: string) {
    const reminder = await this.findForMember(userId, id);
    if (reminder.creatorId !== userId) throw new ForbiddenException('Chỉ người tạo mới xóa được lời nhắc này.');
    await this.prisma.reminder.delete({ where: { id } });
    this.realtime.emitRemindersChanged(reminder.coupleId);
    return { ok: true };
  }

  async plan(userId: string, dto: PlanReminderDto) {
    const member = await this.couples.requireCouple(userId);
    const couple = await this.prisma.couple.findUniqueOrThrow({ where: { id: member.coupleId } });
    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;
    if (!apiKey || !model) throw new ServiceUnavailableException('Chưa cấu hình nhà cung cấp AI trong backend.');
    const now = new Date();
    const localDate = dateInTimezone(now, couple.timezone);
    const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: couple.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    const reserved = await this.reserveAiUsage(member.coupleId, couple.timezone);
    try {
      const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model, temperature: 0.2, max_tokens: 260, response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Bạn giúp lập lời nhắc. Trả đúng JSON với các khóa title, date, time, question. date dùng YYYY-MM-DD; time dùng HH:mm theo múi giờ được cho. Nếu chưa đủ thông tin để chọn ngày hoặc giờ, đặt trường đó thành null và hỏi ngắn gọn trong question. Không tạo lời nhắc hoặc giả vờ đã lưu. Chỉ lên lịch tương lai.' },
            { role: 'user', content: `Múi giờ: ${couple.timezone}. Hiện tại: ${localDate} ${localTime}. Cuộc trò chuyện trước đó:\n${dto.context || '(chưa có)'}\n\nYêu cầu mới: ${dto.prompt}` },
          ],
        }),
      });
      if (!response.ok) throw new ServiceUnavailableException(`AI chưa lập được lịch (${response.status}).`);
      const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) throw new ServiceUnavailableException('AI chưa đưa ra được đề xuất lịch.');
      const result = JSON.parse(content) as { title?: unknown; date?: unknown; time?: unknown; question?: unknown };
      const title = typeof result.title === 'string' ? result.title.trim().slice(0, 160) : '';
      const date = typeof result.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(result.date) ? result.date : null;
      const time = typeof result.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(result.time) ? result.time : null;
      const question = typeof result.question === 'string' ? result.question.trim().slice(0, 500) : '';
      if (date && time && zonedDateTime(date, time, couple.timezone) <= now) {
        return { title, date: null, time: null, question: question || 'Bạn muốn nhắc vào thời điểm nào trong tương lai?' };
      }
      return { title, date, time, question };
    } catch (error) {
      await this.prisma.aiUsage.update({ where: { coupleId_date: { coupleId: member.coupleId, date: reserved.date } }, data: { count: { decrement: 1 } } }).catch(() => undefined);
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('AI chưa thể phân tích lịch. Hãy thử diễn đạt ngày và giờ cụ thể hơn.');
    }
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

  private async dispatchDue() {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const now = new Date();
      const due = await this.prisma.reminder.findMany({ where: { status: 'PENDING', notifiedAt: null, scheduledAt: { lte: now } }, orderBy: { scheduledAt: 'asc' }, take: 50 });
      for (const reminder of due) {
        const claimed = await this.prisma.reminder.updateMany({ where: { id: reminder.id, status: 'PENDING', notifiedAt: null }, data: { notifiedAt: now } });
        if (claimed.count) this.realtime.emitReminderDue(reminder.coupleId, this.present({ ...reminder, notifiedAt: now }));
      }
    } catch { /* The next scheduler tick retries due reminders. */ }
    finally { this.dispatching = false; }
  }

  private async findForMember(userId: string, id: string) {
    const member = await this.couples.requireCouple(userId);
    const reminder = await this.prisma.reminder.findFirst({ where: { id, coupleId: member.coupleId } });
    if (!reminder) throw new NotFoundException('Không tìm thấy lời nhắc trong workspace này.');
    return reminder;
  }

  private present(reminder: { id: string; title: string; scheduledAt: Date; status: 'PENDING' | 'COMPLETED'; notifiedAt: Date | null }) {
    return { id: reminder.id, title: reminder.title, scheduledAt: reminder.scheduledAt.toISOString(), status: reminder.status, notifiedAt: reminder.notifiedAt?.toISOString() || null };
  }
}
