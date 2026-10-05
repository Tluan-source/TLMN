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

/**
 * A couple's day runs 27 hours: from 00:00 of that day until 03:00 the next morning.
 * The 00:00–03:00 window therefore belongs to two days at once — it is the tail of
 * yesterday and the start of today.
 */
export const DAY_OVERLAP_HOURS = 3;

function localDateHour(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
}

/** The day whose conversation is still open: yesterday until 03:00, then today. */
export function activeDay(timezone: string, now = new Date()) {
  const { day, hour } = localDateHour(now, timezone);
  return hour < DAY_OVERLAP_HOURS ? shiftDay(day, -1) : day;
}

/**
 * The days an entry shows up in. An entry always belongs to the day it was filed under;
 * if it was written inside a neighbouring day's 27-hour window, it belongs there too.
 */
export function entryDays(storyDay: string, createdAt: Date, timezone: string) {
  const { day, hour } = localDateHour(createdAt, timezone);
  const windows = hour < DAY_OVERLAP_HOURS ? [day, shiftDay(day, -1)] : [day];
  const neighbours = new Set([shiftDay(storyDay, -1), storyDay, shiftDay(storyDay, 1)]);
  return new Set([storyDay, ...windows.filter((candidate) => neighbours.has(candidate))]);
}
