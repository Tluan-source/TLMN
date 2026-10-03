const { createHash, randomBytes, scryptSync } = require('node:crypto');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const demoOwnerEmail = 'an.demo@example.test';
const demoPartnerEmail = 'binh.demo@example.test';
const demoOwnerName = 'An';
const demoPartnerName = 'Bình';
const storyPrefix = 'demo_story_';

const ownerMoments = [
  'mình hoàn thành phần việc khó nhất sớm hơn dự kiến',
  'buổi họp sáng nay dài nhưng cuối cùng mọi chuyện đã rõ ràng',
  'mình tranh thủ đi bộ một vòng sau giờ làm',
  'bữa trưa có món ngon làm tâm trạng vui hẳn lên',
  'mình giúp một bạn trong nhóm xử lý việc đang mắc',
  'chiều nay trời dịu nên đường về dễ chịu hơn thường ngày',
  'mình dành được một khoảng yên tĩnh để đọc vài trang sách',
  'công việc hơi dồn nhưng mình đã chia nhỏ và giải quyết từng việc',
  'mình gọi về nhà hỏi thăm mọi người sau mấy hôm bận rộn',
  'mình tìm được một quán nhỏ mới gần chỗ làm',
];
const ownerReflections = [
  'Lúc về nhà chỉ muốn kể bạn nghe thôi.',
  'Không phải ngày hoàn hảo, nhưng có vài điều nhỏ làm mình thấy biết ơn.',
  'Mình đã nhớ nghỉ tay và uống nước đều hơn một chút.',
];
const partnerMoments = [
  'mình thử một công thức mới cho bữa trưa',
  'sáng nay có một việc bất ngờ nhưng mọi người hỗ trợ nhau rất nhanh',
  'mình nghe được bài hát cũ trên đường đi và tự nhiên thấy nhớ bạn',
  'mình hoàn thành buổi học còn dang dở từ tuần trước',
  'có người khen chiếc áo mình chọn hôm nay',
  'mình ghé tiệm hoa và chọn được một bó rất xinh',
  'mình ngồi ngoài ban công một lúc sau ngày dài',
  'mình gặp lại một người bạn lâu ngày chưa trò chuyện',
  'mình sắp xếp lại góc bàn và thấy đầu óc nhẹ hơn',
  'bữa tối đơn giản nhưng ăn cùng mọi người rất vui',
];
const partnerReflections = [
  'Đọc chuyện của bạn chắc sẽ là phần mình mong chờ nhất tối nay.',
  'Mình muốn nhớ cảm giác bình yên này lâu hơn một chút.',
  'Mai mình sẽ kể bạn nghe thêm nhé.',
];

function localDay() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftDay(day, amount) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function dayDate(day) {
  return new Date(`${day}T00:00:00.000Z`);
}

function sampleText(role, index) {
  const moments = role === 'owner' ? ownerMoments : partnerMoments;
  const reflections = role === 'owner' ? ownerReflections : partnerReflections;
  return `Hôm nay ${moments[index % moments.length]}. ${reflections[Math.floor(index / moments.length) % reflections.length]}`;
}

function entryTime(day, index) {
  if (day === localDay()) return new Date(Date.now() - (12 - index) * 60_000);
  return new Date(`${day}T${String(10 + (index % 9)).padStart(2, '0')}:20:00.000Z`);
}

async function ensureDemoUser(email, displayName, bio, password) {
  const salt = randomBytes(16).toString('hex');
  const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
  return prisma.user.upsert({
    where: { email },
    create: { email, displayName, bio, passwordHash },
    update: { displayName, bio, passwordHash },
  });
}

async function resolveDemoWorkspace(owner, partner) {
  const memberships = await prisma.coupleMember.findMany({
    where: { userId: { in: [owner.id, partner.id] } },
    include: { couple: { include: { members: { orderBy: { slot: 'asc' } } } } },
  });
  const ownerMembership = memberships.find((membership) => membership.userId === owner.id);
  const partnerMembership = memberships.find((membership) => membership.userId === partner.id);
  if (ownerMembership && partnerMembership && ownerMembership.coupleId !== partnerMembership.coupleId) {
    throw new Error('Hai tài khoản demo đang ở hai workspace khác nhau; không thay đổi dữ liệu.');
  }

  let couple = ownerMembership?.couple || partnerMembership?.couple;
  if (!couple) {
    couple = await prisma.couple.create({
      data: {
        name: 'Góc nhỏ mẫu · Sau một ngày dài',
        members: { create: [{ userId: owner.id, slot: 1 }, { userId: partner.id, slot: 2 }] },
      },
      include: { members: { orderBy: { slot: 'asc' } } },
    });
  } else {
    if (couple.members.some((member) => ![owner.id, partner.id].includes(member.userId))) {
      throw new Error('Workspace demo có thành viên ngoài tài khoản mẫu; không thay đổi dữ liệu.');
    }
    if (!ownerMembership) await prisma.coupleMember.create({ data: { coupleId: couple.id, userId: owner.id, slot: 1 } });
    if (!partnerMembership) await prisma.coupleMember.create({ data: { coupleId: couple.id, userId: partner.id, slot: 2 } });
  }
  return couple;
}

async function upsertSampleStory({ coupleId, user, role, day, index, scope }) {
  const storyId = `${storyPrefix}${scope}_${role}_${day.replaceAll('-', '')}`;
  const existing = await prisma.dailyStory.findUnique({
    where: { coupleId_authorId_date: { coupleId, authorId: user.id, date: dayDate(day) } },
  });

  if (existing && existing.id !== storyId) return { story: existing, seeded: false };

  const story = existing
    ? await prisma.dailyStory.update({ where: { id: storyId }, data: { status: 'PUBLISHED' } })
    : await prisma.dailyStory.create({
        data: { id: storyId, coupleId, authorId: user.id, date: dayDate(day), status: 'PUBLISHED' },
      });
  const entryId = `demo_entry_${scope}_${role}_${day.replaceAll('-', '')}`;
  await prisma.storyEntry.upsert({
    where: { id: entryId },
    create: { id: entryId, storyId: story.id, content: sampleText(role, index), createdAt: entryTime(day, 0) },
    update: { content: sampleText(role, index), createdAt: entryTime(day, 0) },
  });

  if (index % 7 === 6) {
    const followUpId = `demo_entry2_${scope}_${role}_${day.replaceAll('-', '')}`;
    await prisma.storyEntry.upsert({
      where: { id: followUpId },
      create: { id: followUpId, storyId: story.id, content: 'Một khoảnh khắc nữa mình muốn lưu lại trước khi ngày khép lại.', createdAt: entryTime(day, 1) },
      update: { content: 'Một khoảnh khắc nữa mình muốn lưu lại trước khi ngày khép lại.', createdAt: entryTime(day, 1) },
    });
  }

  return { story, seeded: true };
}

async function seedComments(ownerId, partnerId, storyId, scope) {
  const rootId = `demo_comment_${scope}_today`;
  const replyId = `demo_reply_${scope}_today`;
  await prisma.comment.upsert({
    where: { id: rootId },
    create: {
      id: rootId,
      storyId,
      authorId: ownerId,
      content: 'Nghe đoạn chiều nay của bạn thấy muốn đi dạo cùng nhau ghê.',
    },
    update: { content: 'Nghe đoạn chiều nay của bạn thấy muốn đi dạo cùng nhau ghê.' },
  });
  await prisma.comment.upsert({
    where: { id: replyId },
    create: {
      id: replyId,
      storyId,
      authorId: partnerId,
      parentId: rootId,
      content: 'Vậy cuối tuần mình đi nhé, để mình chọn một con đường thật mát.',
    },
    update: { content: 'Vậy cuối tuần mình đi nhé, để mình chọn một con đường thật mát.' },
  });
}

async function seedPreviewSummary(coupleId, day, owner, partner) {
  const date = dayDate(day);
  const existing = await prisma.dailySummary.findUnique({ where: { coupleId_date: { coupleId, date } } });
  if (existing) return false;

  const stories = await prisma.dailyStory.findMany({
    where: { coupleId, date, status: 'PUBLISHED' },
    include: {
      author: { select: { id: true, displayName: true } },
      entries: { orderBy: { createdAt: 'asc' }, select: { content: true, createdAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!stories.some((story) => story.authorId === owner.id) || !stories.some((story) => story.authorId === partner.id)) return false;

  const sourceHash = createHash('sha256').update(JSON.stringify(stories.map((story) => ({
    authorId: story.authorId,
    author: story.author.displayName,
    entries: story.entries.map((entry) => ({ content: entry.content.trim(), createdAt: entry.createdAt.toISOString() })),
  })))).digest('hex');
  const ownerStory = stories.find((story) => story.authorId === owner.id);
  const partnerStory = stories.find((story) => story.authorId === partner.id);
  const content = [
    `Ngày của ${owner.displayName}: ${ownerStory.entries.map((entry) => entry.content.trim()).join(' ')}`,
    `Ngày của ${partner.displayName}: ${partnerStory.entries.map((entry) => entry.content.trim()).join(' ')}`,
    'Điều đáng nhớ của hai đứa: Cả hai đều dành thời gian để chậm lại, quan tâm đến những điều nhỏ và kể cho nhau nghe vào cuối ngày.',
  ].join('\n\n');
  await prisma.dailySummary.create({
    data: { coupleId, date, sourceHash, content, model: 'demo-ui-preview' },
  });
  return true;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Thiếu DATABASE_URL.');
  const hostname = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('Seed demo chỉ chạy trên PostgreSQL loopback để tránh ghi dữ liệu lên môi trường dùng chung.');
  }
  if ((process.env.STORAGE_DRIVER || 'local') !== 'local') {
    throw new Error('Seed demo yêu cầu STORAGE_DRIVER=local.');
  }

  const ownerPassword = `${randomBytes(18).toString('base64url')}Aa1!`;
  const partnerPassword = `${randomBytes(18).toString('base64url')}Bb2!`;
  const owner = await ensureDemoUser(demoOwnerEmail, demoOwnerName, 'Thích lưu lại những điều bình dị mỗi ngày.', ownerPassword);
  const partner = await ensureDemoUser(demoPartnerEmail, demoPartnerName, 'Thích những buổi chiều chậm và các câu chuyện nhỏ trong ngày.', partnerPassword);
  const couple = await resolveDemoWorkspace(owner, partner);
  const scope = createHash('sha1').update(couple.id).digest('hex').slice(0, 8);
  const today = localDay();
  let seededStories = 0;
  let preservedStories = 0;
  let seededEntries = 0;
  let previewSummaryCreated = false;
  const todayPartnerStoryId = `${storyPrefix}${scope}_partner_${today.replaceAll('-', '')}`;

  for (let offset = 29; offset >= 0; offset -= 1) {
    const day = shiftDay(today, -offset);
    const index = 29 - offset;
    for (const [role, user] of [['owner', owner], ['partner', partner]]) {
      const result = await upsertSampleStory({ coupleId: couple.id, user, role, day, index, scope });
      if (result.seeded) {
        seededStories += 1;
        seededEntries += index % 7 === 6 ? 2 : 1;
      } else {
        preservedStories += 1;
      }
    }
  }

  const partnerToday = await prisma.dailyStory.findUnique({
    where: { coupleId_authorId_date: { coupleId: couple.id, authorId: partner.id, date: dayDate(today) } },
  });
  if (partnerToday?.id === todayPartnerStoryId) await seedComments(owner.id, partner.id, partnerToday.id, scope);

  const yesterday = shiftDay(today, -1);
  const ownerYesterday = await prisma.dailyStory.findUnique({
    where: { coupleId_authorId_date: { coupleId: couple.id, authorId: owner.id, date: dayDate(yesterday) } },
  });
  const partnerYesterday = await prisma.dailyStory.findUnique({
    where: { coupleId_authorId_date: { coupleId: couple.id, authorId: partner.id, date: dayDate(yesterday) } },
  });
  if (ownerYesterday?.id.startsWith(storyPrefix) && partnerYesterday?.id.startsWith(storyPrefix)) {
    previewSummaryCreated = await seedPreviewSummary(couple.id, yesterday, owner, partner);
  }

  console.log(`Workspace demo: ${couple.name}`);
  console.log(`Tài khoản 1: ${demoOwnerEmail} / ${ownerPassword}`);
  console.log(`Tài khoản 2: ${demoPartnerEmail} / ${partnerPassword}`);
  console.log(`Đã chuẩn bị ${seededStories} câu chuyện mẫu; giữ nguyên ${preservedStories} câu chuyện đã có.`);
  console.log(`Đã chuẩn bị ${seededEntries} đoạn kể mẫu và một luồng bình luận/trả lời hôm nay.`);
  console.log(`Tóm tắt xem trước hôm qua: ${previewSummaryCreated ? 'đã tạo' : 'đã có sẵn hoặc không đủ dữ liệu mẫu để tạo'}.`);
  console.log('Dùng hai tài khoản này trong cửa sổ riêng để thử giao diện; mỗi lần seed sẽ đặt mật khẩu demo mới. Không dùng chúng ngoài local.');
  console.log(`Streak mẫu: 30 ngày liên tiếp. Ngày hôm nay: ${today}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
