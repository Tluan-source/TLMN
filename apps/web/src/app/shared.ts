'use client';

import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

export type ViewedPhoto = { url: string; alt: string };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...init });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.message || `Có lỗi xảy ra (${response.status}).`);
  return payload as T;
}

const MODAL_EXIT_MS = 180;
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Shared modal behaviour: locks page scroll, moves focus inside and keeps Tab there,
 * closes on Escape, gives focus back on close, and lets the exit animation finish first.
 */
export function useModal(onClose: () => void): { panelRef: RefObject<HTMLElement | null>; closing: boolean; close: () => void } {
  const panelRef = useRef<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (prefersReducedMotion()) { onCloseRef.current(); return; }
    setClosing(true);
    window.setTimeout(() => onCloseRef.current(), MODAL_EXIT_MS);
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [close]);

  return { panelRef, closing, close };
}

function vietnamParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
}

/** The calendar date right now. */
export function todayInVietnam() {
  return vietnamParts(new Date()).day;
}

/** A day lasts 27 hours (until 03:00 next morning), so 00:00–03:00 still belongs to yesterday as well. */
export const DAY_OVERLAP_HOURS = 3;

export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** The day whose conversation is still open: yesterday until 03:00, then today. */
export function activeDayInVietnam() {
  const { day, hour } = vietnamParts(new Date());
  return hour < DAY_OVERLAP_HOURS ? shiftDay(day, -1) : day;
}

/** The calendar day an instant falls on, in Vietnam time. */
export function vietnamDayOf(value: string) {
  return vietnamParts(new Date(value)).day;
}

export function formatDay(day: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${day}T00:00:00Z`));
}

export function formatMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
