import { BadRequestException } from '@nestjs/common';

export function parseDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BadRequestException('Ngày không hợp lệ.');
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== day) {
    throw new BadRequestException('Ngày không hợp lệ.');
  }
  return date;
}

export function dateInTimezone(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function shiftDay(day: string, amount: number) {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
