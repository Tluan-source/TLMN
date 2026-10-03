import { randomUUID } from 'node:crypto';
import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { dateInTimezone, parseDay } from '../../shared/dates';
import { CouplesService } from '../couples/couples.service';
import { MediaService } from './media.service';

@Injectable()
export class ImageSuggestionService {
  constructor(private readonly prisma: PrismaService, private readonly couples: CouplesService, private readonly media: MediaService) {}

  async suggest(userId: string, file: Express.Multer.File) {
    if (!file?.mimetype?.toLowerCase().startsWith('image/')) throw new HttpException('AI chỉ gợi ý chú thích cho ảnh.', 415);
    this.media.validateUpload(file, 'STORY');
    const member = await this.couples.requireCouple(userId);
    const couple = await this.prisma.couple.findUniqueOrThrow({ where: { id: member.coupleId } });
    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;
    if (!apiKey || !model) throw new ServiceUnavailableException('Chưa cấu hình nhà cung cấp AI trong backend.');

    const usageDate = parseDay(dateInTimezone(new Date(), couple.timezone));
    const reserved = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "AiUsage" ("id", "coupleId", "date", "count")
      VALUES (${randomUUID()}, ${member.coupleId}, ${usageDate}, 1)
      ON CONFLICT ("coupleId", "date") DO UPDATE
      SET "count" = "AiUsage"."count" + 1
      WHERE "AiUsage"."count" < 5
      RETURNING "count"
    `;
    if (!reserved.length) throw new HttpException('Workspace đã dùng hết 5 lượt AI hôm nay.', 429);

    try {
      const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model,
          temperature: 0.6,
          max_tokens: 180,
          messages: [
            { role: 'system', content: 'Bạn viết bằng tiếng Việt, dịu dàng và ngắn gọn. Gợi ý một câu chia sẻ tự nhiên dựa trên điều nhìn thấy rõ trong ảnh. Không nhận diện người, không suy đoán thông tin riêng tư, không bịa thêm sự kiện. Chỉ trả về câu gợi ý, tối đa 35 từ.' },
            { role: 'user', content: [
              { type: 'text', text: 'Viết một gợi ý ngắn để người dùng kể câu chuyện gắn với bức ảnh này.' },
              { type: 'image_url', image_url: { url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` } },
            ] },
          ],
        }),
      });
      if (!response.ok) throw new ServiceUnavailableException(`AI chưa tạo được gợi ý ảnh (${response.status}). Kiểm tra model có hỗ trợ hình ảnh.`);
      const payload = await response.json() as { choices?: { message?: { content?: string | { text?: string }[] } }[] };
      const raw = payload.choices?.[0]?.message?.content;
      const suggestion = typeof raw === 'string' ? raw.trim() : raw?.map((part) => part.text || '').join('').trim();
      if (!suggestion) throw new ServiceUnavailableException('AI chưa tạo được gợi ý cho ảnh này.');
      return { suggestion };
    } catch (error) {
      await this.prisma.aiUsage.update({ where: { coupleId_date: { coupleId: member.coupleId, date: usageDate } }, data: { count: { decrement: 1 } } });
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('AI chưa phản hồi. Ảnh của bạn chưa được lưu hoặc thay đổi.');
    }
  }
}
