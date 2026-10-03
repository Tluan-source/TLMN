'use client';

import { ChangeEvent, FormEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Bell, Bookmark, CalendarDays, Camera, Check, ChevronLeft, ChevronRight, Heart, House, LockKeyhole,
  HeartCrack, ImagePlus, LogOut, MessageCircle, RotateCcw, Search, Send, Settings2, SmilePlus, Sparkles, Square, Trash2, UsersRound, Video, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { CHAT_ICONS, MESSAGE_REACTIONS } from '@chuyen/contracts';
import type { AnniversaryItem, AnniversarySuggestion, CalendarMemory, CommentItem, CoupleWorkspace, DailyStory, Gender, MessageReaction, ReminderItem, StreakStatus, UserProfile } from '@chuyen/contracts';

type Account = UserProfile & { email: string };
type SummaryState = { summary: string | null; sourceHash?: string; updatedAt?: string; stale?: boolean; canCreate?: boolean };
type ViewedPhoto = { url: string; alt: string };
type Page = 'home' | 'day' | 'calendar' | 'profile';
const MAX_VIDEO_SECONDS = 7;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...init });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.message || `Có lỗi xảy ra (${response.status}).`);
  return payload as T;
}

// Phone camera photos are often 3–10 MB; shrink them before upload so sending stays fast on mobile data.
async function shrinkImage(file: File, maxSide = 2048, quality = 0.85): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 1024 * 1024) return file;
  const url = URL.createObjectURL(file);
  try {
    // Decode through <img> so the camera's EXIF rotation is applied; createImageBitmap ignores it on some phones.
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function todayInVietnam() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts;
}

function formatDay(day: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${day}T00:00:00Z`));
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function formatReminderTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: timezone, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function defaultReminderDateTime(timezone: string) {
  const date = new Date(Date.now() + 10 * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join('') || '♡';
}

function Avatar({ user, className = '' }: { user: Pick<UserProfile, 'displayName' | 'avatarUrl'>; className?: string }) {
  return <span className={`avatar ${className}`}>{user.avatarUrl ? <img src={user.avatarUrl} alt={`Ảnh đại diện ${user.displayName}`} /> : initials(user.displayName)}</span>;
}

function chatLabel(user: UserProfile) {
  return user.chatNickname?.trim() || user.displayName;
}

const MODAL_EXIT_MS = 180;
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Shared modal behaviour: locks page scroll, moves focus inside and keeps Tab there,
 * closes on Escape, gives focus back on close, and lets the exit animation finish first.
 */
function useModal(onClose: () => void): { panelRef: RefObject<HTMLElement | null>; closing: boolean; close: () => void } {
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

function StreakHeart({ progress }: { progress: number }) {
  const heartPath = 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';
  // The pointed tip hides very small fills behind the outline at icon size.
  const visibleProgress = progress > 0 ? Math.max(progress, 10) : 0;
  const waterline = visibleProgress <= 50
    ? 21 - 10 * Math.sqrt(visibleProgress / 50)
    : 11 - 9 * (visibleProgress - 50) / 50;

  return <svg className="streak-heart" viewBox="0 0 24 24" aria-hidden="true">
    <defs><clipPath id="streak-heart-clip"><path d={heartPath} /></clipPath></defs>
    <path d={heartPath} fill="#fff0f6" />
    {progress > 0 && <g clipPath="url(#streak-heart-clip)">
      {progress >= 100 ? <path d={heartPath} fill="#db2777" /> : <>
        <rect x="0" y={waterline + 0.7} width="24" height="24" fill="#db2777" />
        <g transform={`translate(0 ${waterline})`}>
          <path className="heart-water-back" d="M-24 0 Q-18 -1.5 -12 0 T0 0 T12 0 T24 0 T36 0 T48 0 V26 H-24Z" />
          <path className="heart-water-front" d="M-24 0.3 Q-18 1.8 -12 0.3 T0 0.3 T12 0.3 T24 0.3 T36 0.3 T48 0.3 V26 H-24Z" />
        </g>
      </>}
    </g>}
    <path d={heartPath} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>;
}

export default function Home() {
  const [account, setAccount] = useState<Account | null>(null);
  const [workspace, setWorkspace] = useState<CoupleWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>('home');
  const [day, setDay] = useState(todayInVietnam);
  const [calendarYear, setCalendarYear] = useState(() => Number(todayInVietnam().slice(0, 4)));
  const [calendarDays, setCalendarDays] = useState<CalendarMemory[]>([]);
  const [anniversaries, setAnniversaries] = useState<AnniversaryItem[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [stories, setStories] = useState<DailyStory[]>([]);
  const [streak, setStreak] = useState<StreakStatus | null>(null);
  const [summary, setSummary] = useState<SummaryState | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [content, setContent] = useState('');
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteEntry, setInviteEntry] = useState('');
  const [viewedPhoto, setViewedPhoto] = useState<ViewedPhoto | null>(null);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [reminderRevision, setReminderRevision] = useState(0);
  const [loadedDay, setLoadedDay] = useState<string | null>(null);
  const chatSurfaceRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const scrolledTimelineRef = useRef<{ key: string; count: number }>({ key: '', count: 0 });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingPreviewRef = useRef<HTMLVideoElement>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const dayRef = useRef(day);
  const pageRef = useRef(page);
  const calendarYearRef = useRef(calendarYear);

  const toastTimeoutRef = useRef<number | null>(null);
  const notify = useCallback((message: string) => {
    // A newer toast restarts the clock; otherwise the older timer would cut it short.
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
    setToast(message);
    toastTimeoutRef.current = window.setTimeout(() => { setToast(''); toastTimeoutRef.current = null; }, 3800);
  }, []);
  const closePhoto = useCallback(() => setViewedPhoto(null), []);

  const reloadWorkspace = useCallback(async () => {
    const result = await api<{ couple: CoupleWorkspace | null }>('/couples/me');
    setWorkspace(result.couple);
    return result.couple;
  }, []);

  const loadDay = useCallback(async (date: string) => {
    if (!workspace) return;
    try {
      const [dailyStories, dailyStreak, dailySummary] = await Promise.all([
        api<DailyStory[]>(`/stories?date=${date}`),
        api<StreakStatus>('/streaks/me'),
        api<SummaryState>(`/couples/me/days/${date}/summary`),
      ]);
      // A slower response for a day the user already left must not overwrite the current one.
      if (date !== dayRef.current) return;
      setStories(dailyStories);
      setStreak(dailyStreak);
      setSummary(dailySummary);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Chưa tải được câu chuyện.');
    } finally {
      if (date === dayRef.current) setLoadedDay(date);
    }
  }, [notify, workspace]);

  const loadCalendar = useCallback(async (year: number) => {
    if (!workspace) return;
    setCalendarLoading(true);
    try {
      const [memories, anniversaryItems] = await Promise.all([
        api<CalendarMemory[]>(`/stories/calendar?year=${year}`),
        api<AnniversaryItem[]>(`/anniversaries?year=${year}`),
      ]);
      setCalendarDays(memories);
      setAnniversaries(anniversaryItems);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Chưa tải được kỷ niệm.');
    } finally {
      setCalendarLoading(false);
    }
  }, [notify, workspace]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const authResponse = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (authResponse.status === 401) return;
        if (!authResponse.ok) throw new Error(`Chưa tải được phiên (${authResponse.status}).`);
        const me = await authResponse.json() as Account;
        if (!active) return;
        setAccount(me);
        const current = await api<{ couple: CoupleWorkspace | null }>('/couples/me');
        if (!active) return;
        setWorkspace(current.couple);
        const invite = new URLSearchParams(window.location.search).get('invite') || '';
        if (invite) setInviteEntry(invite);
      } catch (error) {
        if (error instanceof Error && !error.message.includes('(401)')) notify(error.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    void initialize();
    return () => { active = false; };
  }, [notify]);

  useEffect(() => {
    if (workspace) void loadDay(day);
  }, [workspace, day, loadDay]);

  useEffect(() => {
    if (workspace && page === 'calendar') void loadCalendar(calendarYear);
  }, [workspace, page, calendarYear, loadCalendar]);

  useEffect(() => {
    dayRef.current = day;
    pageRef.current = page;
    calendarYearRef.current = calendarYear;
  }, [day, page, calendarYear]);

  useEffect(() => {
    setChatSearch('');
    setChatSearchOpen(false);
  }, [day]);

  useEffect(() => () => {
    if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
    if (recordingIntervalRef.current !== null) window.clearInterval(recordingIntervalRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const preview = recordingPreviewRef.current;
    if (!preview || !recording || !recordingStreamRef.current) return;
    preview.srcObject = recordingStreamRef.current;
    void preview.play().catch(() => undefined);
    return () => { preview.srcObject = null; };
  }, [recording]);

  useEffect(() => {
    if (!account || !workspace) return;
    const realtimeUrl = process.env.NEXT_PUBLIC_BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:4000`;
    const socket = io(realtimeUrl, {
      autoConnect: false,
      transports: ['websocket'],
      auth: (callback) => {
        void api<{ ticket: string }>('/auth/realtime-ticket', { method: 'POST' })
          .then(({ ticket }) => callback({ ticket }))
          .catch(() => callback({ ticket: '' }));
      },
    });
    socket.on('chat:changed', ({ date }: { date: string }) => {
      if (date === dayRef.current) void loadDay(date);
      if (pageRef.current === 'calendar' && Number(date.slice(0, 4)) === calendarYearRef.current) {
        void loadCalendar(calendarYearRef.current);
      }
    });
    socket.on('reminders:changed', () => setReminderRevision((revision) => revision + 1));
    socket.on('reminder:due', (reminder: ReminderItem) => notify(`Đến giờ rồi: ${reminder.title}`));
    socket.on('workspace:changed', () => { void reloadWorkspace().then(() => loadDay(dayRef.current)); });
    socket.connect();
    return () => { socket.disconnect(); };
  }, [account?.id, workspace?.id, loadDay, loadCalendar, notify, reloadWorkspace]);


  const partner = useMemo(() => workspace?.members.find((member) => member.id !== account?.id) || null, [workspace, account]);
  const timeline = useMemo(() => stories
    .flatMap((story) => story.entries.map((entry) => ({ story, entry })))
    .sort((left, right) => Date.parse(left.entry.createdAt) - Date.parse(right.entry.createdAt)
      || left.entry.id.localeCompare(right.entry.id)), [stories]);
  const dayReady = loadedDay === day;
  const lastTimelineItem = timeline.at(-1);

  // Jump to the newest message when a day opens; afterwards only follow new messages if the
  // reader is already near the bottom (or sent it), so reactions and comments never yank the view.
  useEffect(() => {
    const surface = chatSurfaceRef.current;
    if (!surface || !['home', 'day'].includes(page)) { scrolledTimelineRef.current = { key: '', count: 0 }; return; }
    if (!dayReady) return;
    const key = `${page}:${day}`;
    const previous = scrolledTimelineRef.current;
    scrolledTimelineRef.current = { key, count: timeline.length };
    if (previous.key !== key) {
      const frame = window.requestAnimationFrame(() => surface.scrollTo({ top: surface.scrollHeight }));
      return () => window.cancelAnimationFrame(frame);
    }
    if (timeline.length <= previous.count) return;
    const nearBottom = surface.scrollHeight - surface.scrollTop - surface.clientHeight < 160;
    if (!nearBottom && lastTimelineItem?.story.author.id !== account?.id) return;
    const frame = window.requestAnimationFrame(() => surface.scrollTo({ top: surface.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
    return () => window.cancelAnimationFrame(frame);
  }, [timeline.length, lastTimelineItem, dayReady, page, day, account?.id]);

  // The composer grows with its text instead of showing a resize handle.
  useEffect(() => {
    const input = composerInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 2, 120)}px`;
  }, [content]);

  const visibleTimeline = useMemo(() => {
    const query = chatSearch.trim().toLocaleLowerCase('vi');
    if (!query) return timeline;
    return timeline.filter(({ story, entry }) => [entry.content, chatLabel(story.author), ...story.comments.flatMap((comment) => [comment.content, chatLabel(comment.author)])].join(' ').toLocaleLowerCase('vi').includes(query));
  }, [chatSearch, timeline]);
  const memoryMonths = useMemo(() => {
    const grouped = new Map<string, CalendarMemory[]>();
    for (const memory of calendarDays) {
      const month = memory.date.slice(0, 7);
      grouped.set(month, [...(grouped.get(month) || []), memory]);
    }
    for (const anniversary of anniversaries) {
      const month = anniversary.date.slice(0, 7);
      if (!grouped.has(month)) grouped.set(month, []);
    }
    const currentMonth = todayInVietnam().slice(0, 7);
    if (calendarYear === Number(currentMonth.slice(0, 4)) && !grouped.has(currentMonth)) grouped.set(currentMonth, []);
    return Array.from(grouped.entries()).sort(([left], [right]) => right.localeCompare(left));
  }, [anniversaries, calendarDays, calendarYear]);
  const anniversariesByDate = useMemo(() => {
    const grouped = new Map<string, AnniversaryItem[]>();
    for (const anniversary of anniversaries) grouped.set(anniversary.date, [...(grouped.get(anniversary.date) || []), anniversary]);
    return grouped;
  }, [anniversaries]);
  const canCreateSummary = summary?.canCreate !== false
    && (stories.some((story) => story.entries.some((entry) => entry.content.trim())) || Boolean(summary?.summary));
  const streakProgress = Math.max(0, Math.min(100, streak?.progress ?? 0));
  const streakLabel = `${streak?.month ? `Trái tim ${formatMonth(streak.month)}` : 'Trái tim tháng này'}: ${streak?.monthStreakDays ?? 0}/${streak?.target ?? 30} ngày giữ streak · ${streak?.current ?? 0} ngày liên tiếp · Kỷ lục ${streak?.best ?? 0}`;

  const authenticate = async (event: FormEvent<HTMLFormElement>, mode: 'login' | 'register') => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const user = await api<Account>(`/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          ...(mode === 'register' ? { displayName: form.get('displayName') } : {}),
        }),
      });
      setAccount(user);
      await reloadWorkspace();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Chưa đăng nhập được.');
    } finally { setBusy(false); }
  };

  const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api('/couples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name') }) });
      await reloadWorkspace();
      notify('Góc nhỏ của hai đứa đã được tạo.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa tạo được workspace.'); }
    finally { setBusy(false); }
  };

  const createInvitation = async () => {
    setBusy(true);
    try {
      const invitation = await api<{ token: string; expiresInHours: number }>('/couples/me/invitations', { method: 'POST' });
      setInviteUrl(`${window.location.origin}/?invite=${encodeURIComponent(invitation.token)}`);
      notify('Link mời có hiệu lực trong 24 giờ.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa tạo được lời mời.'); }
    finally { setBusy(false); }
  };

  const acceptInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/couples/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: inviteEntry }) });
      window.history.replaceState({}, '', '/');
      setInviteEntry('');
      await reloadWorkspace();
      notify('Hai bạn đã kết nối với nhau.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Lời mời không hợp lệ.'); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); }
    catch { /* The local page still clears its signed-in state. */ }
    finally { setAccount(null); setWorkspace(null); setStories([]); setPage('home'); }
  };

  const stopVideoRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const startVideoRecording = async () => {
    if (recording || selectedFiles.length >= 10) {
      if (selectedFiles.length >= 10) notify('Mỗi câu chuyện có thể đính kèm tối đa 10 tệp.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      (document.getElementById('story-video') as HTMLInputElement | null)?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } });
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recordingChunksRef.current.push(event.data); };
      recorder.onerror = () => {
        notify('Không thể quay video trên thiết bị này.');
        stopVideoRecording();
      };
      recorder.onstop = () => {
        const recordedType = recorder.mimeType.split(';', 1)[0] || 'video/webm';
        const extension = recordedType === 'video/mp4' ? 'mp4' : 'webm';
        const blob = new Blob(recordingChunksRef.current, { type: recordedType });
        if (blob.size > 0) {
          const file = new File([blob], `video-${Date.now()}.${extension}`, { type: recordedType, lastModified: Date.now() });
          setSelectedFiles((current) => [...current, file].slice(0, 10));
        }
        recordingChunksRef.current = [];
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
        if (recordingIntervalRef.current !== null) window.clearInterval(recordingIntervalRef.current);
        recordingTimeoutRef.current = null;
        recordingIntervalRef.current = null;
        setRecording(false);
        setRecordingSeconds(0);
      };
      recorder.start(200);
      const startedAt = Date.now();
      setRecording(true);
      setRecordingSeconds(0);
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.min(MAX_VIDEO_SECONDS, Math.floor((Date.now() - startedAt) / 1000)));
      }, 200);
      recordingTimeoutRef.current = window.setTimeout(stopVideoRecording, MAX_VIDEO_SECONDS * 1000);
    } catch (error) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      notify(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Hãy cho phép dùng camera và micro để quay video.' : 'Chưa thể mở camera để quay video.');
    }
  };

  const filesChanged = (event: ChangeEvent<HTMLInputElement>) => {
    const addedFiles = Array.from(event.currentTarget.files || []);
    const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const validFiles = addedFiles.filter((file) => imageTypes.has(file.type) && file.size <= 25 * 1024 * 1024);
    if (validFiles.length !== addedFiles.length) notify('Chỉ nhận ảnh JPEG, PNG, WebP tối đa 25 MB.');
    if (selectedFiles.length + validFiles.length > 10) notify('Mỗi câu chuyện có thể đính kèm tối đa 10 tệp.');
    setSelectedFiles((current) => [...current, ...validFiles].slice(0, 10));
    event.currentTarget.value = '';
  };

  const videoFileChanged = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!['video/webm', 'video/mp4', 'video/quicktime'].includes(file.type) || file.size > 25 * 1024 * 1024) {
      notify('Video cần là WebM hoặc MP4 và tối đa 25 MB.');
      return;
    }
    if (selectedFiles.length >= 10) {
      notify('Mỗi câu chuyện có thể đính kèm tối đa 10 tệp.');
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const duration = probe.duration;
      URL.revokeObjectURL(url);
      if (!Number.isFinite(duration) || duration > MAX_VIDEO_SECONDS + 0.05) {
        notify(`Video chỉ được dài tối đa ${MAX_VIDEO_SECONDS} giây.`);
        return;
      }
      setSelectedFiles((current) => [...current, file].slice(0, 10));
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      notify('Không đọc được video này.');
    };
    probe.src = url;
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  };

  const publishStory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (recording) { notify('Hãy dừng video trước khi chia sẻ.'); return; }
    if (!content.trim() && selectedFiles.length === 0) { notify('Viết vài dòng hoặc chọn ảnh trước nhé.'); return; }
    setBusy(true);
    const form = new FormData();
    form.set('date', day);
    form.set('content', content);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    form.set('status', submitter?.value === 'DRAFT' ? 'DRAFT' : 'PUBLISHED');
    try {
      for (const file of selectedFiles) form.append('files', await shrinkImage(file));
      await api('/stories', { method: 'POST', body: form });
      setContent('');
      setSelectedFiles([]);
      const input = document.getElementById('story-files') as HTMLInputElement | null;
      if (input) input.value = '';
      await loadDay(day);
      notify('Câu chuyện nhỏ đã được lưu.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa đăng được câu chuyện.'); }
    finally { setBusy(false); }
  };

  const postReply = async (event: FormEvent<HTMLFormElement>, storyId: string, parentId?: string) => {
    event.preventDefault();
    if (!replyContent.trim()) return;
    setBusy(true);
    try {
      await api(`/stories/${storyId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: replyContent, parentId }) });
      setReplyContent('');
      setReplyTarget(null);
      await loadDay(day);
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa gửi được bình luận.'); }
    finally { setBusy(false); }
  };

  const postReaction = async (storyId: string, entryId: string, emoji: string) => {
    try {
      await api(`/stories/${storyId}/entries/${entryId}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) });
      await loadDay(day);
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa thả được icon.'); }
  };

  const useImageSuggestion = (suggestion: string) => {
    setContent((current) => current.trim() ? `${current.trimEnd()}\n${suggestion}` : suggestion);
  };

  const makeSummary = async () => {
    setSummaryBusy(true);
    try {
      const result = await api<SummaryState>(`/couples/me/days/${day}/summary`, { method: 'POST' });
      setSummary(result);
      notify(result.stale ? 'Câu chuyện đã thay đổi. Hãy thử tạo lại nhé.' : 'Đã gói lại ngày hôm nay.');
    } catch (error) { notify(error instanceof Error ? error.message : 'AI chưa tạo được tóm tắt.'); }
    finally { setSummaryBusy(false); }
  };

  if (loading) return <main className="loading">Đang mở góc nhỏ của hai bạn…</main>;
  if (!account) return <AuthScreen busy={busy} toast={toast} onSubmit={authenticate} />;
  if (!workspace) return <WorkspaceStart account={account} inviteEntry={inviteEntry} setInviteEntry={setInviteEntry} busy={busy} toast={toast} onCreate={createWorkspace} onAccept={acceptInvitation} onLogout={logout} />;

  return (
    <main className={`shell ${page === 'home' && day === todayInVietnam() ? 'has-chat-composer' : ''}`}>
      {toast && <div className="toast" role="status" key={toast}>{toast}</div>}
      <div className="sticky-header">
        <header className="topbar">
          <div className="brand"><span className="brand-mark"><Heart size={21} fill="currentColor" /></span><div><h1>Trò chuyện với nhau sau 1 ngày dài</h1><p>{workspace.name}</p></div></div>
          <div className="topbar-actions">
            <button className={`profile-avatar-button ${page === 'profile' ? 'active' : ''}`} type="button" onClick={() => setPage('profile')} title="Mở hồ sơ cá nhân" aria-label="Mở hồ sơ cá nhân"><Avatar user={account} /></button>
            <button className="icon-button" onClick={() => void logout()} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={18} /></button>
          </div>
        </header>

        <div className="nav-row">
          <nav className="top-nav" data-active={page === 'home' || page === 'calendar' ? page : 'none'} aria-label="Điều hướng chính">
            <button className={`nav-button ${page === 'home' ? 'active' : ''}`} type="button" aria-current={page === 'home' ? 'page' : undefined} onClick={() => { setDay(todayInVietnam()); setPage('home'); }}><House size={17} /> Hôm nay</button>
            <button className={`nav-button ${page === 'calendar' ? 'active' : ''}`} type="button" aria-current={page === 'calendar' ? 'page' : undefined} onClick={() => setPage('calendar')}><CalendarDays size={17} /> Kỷ niệm</button>
          </nav>
          {/* The streak details live in the heart's label/tooltip so the row stays one line. */}
          <span className="heart-badge nav-heart" role="img" aria-label={streakLabel} title={streakLabel}><StreakHeart progress={streakProgress} /></span>
        </div>
      </div>

        {(page === 'home' || page === 'day') && <>

        {page === 'day' && <div className="date-row"><h2>{day === todayInVietnam() ? 'Hôm nay' : 'Ngày mình cùng nhớ'}</h2><div className="date-controls"><button className="icon-button" type="button" title="Quay lại Kỷ niệm" aria-label="Quay lại Kỷ niệm" onClick={() => setPage('calendar')}><ChevronLeft size={18} /></button><input className="date-picker" type="date" aria-label="Chọn ngày câu chuyện" max={todayInVietnam()} value={day} onChange={(event) => { const nextDay = event.target.value; setDay(nextDay); setPage(nextDay === todayInVietnam() ? 'home' : 'day'); }} /></div></div>}
        </>}

      {(page === 'home' || page === 'day') && <>
        <div className="chat-stage">
          <header className={`chat-panel-header ${chatSearchOpen ? 'searching' : ''}`}>
            <Avatar user={partner || account} />
            <div className="chat-panel-title"><h2>{workspace.name}</h2><span>{page === 'day' ? formatDay(day) : `${timeline.length} tin nhắn hôm nay`}</span></div>
            <div className="chat-toolbar">
              {chatSearchOpen ? <form className="chat-search-form" role="search" onSubmit={(event) => event.preventDefault()}><Search size={16} /><input autoFocus value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Tìm trong tin nhắn" aria-label="Tìm trong tin nhắn" /><button className="icon-button" type="button" title="Đóng tìm kiếm" aria-label="Đóng tìm kiếm" onClick={() => { setChatSearch(''); setChatSearchOpen(false); }}><X size={16} /></button></form> : <div className="chat-toolbar-actions"><button className="icon-button" type="button" title="Cài đặt chat" aria-label="Cài đặt chat" onClick={() => setChatSettingsOpen(true)}><Settings2 size={17} /></button><button className="icon-button" type="button" title="Tìm tin nhắn" aria-label="Tìm tin nhắn" onClick={() => setChatSearchOpen(true)}><Search size={17} /></button></div>}
            </div>
          </header>
          <div className="chat-panel-body">
            <div ref={chatSurfaceRef} className="chat-surface" style={{ backgroundColor: workspace.chatBackground || '#fff7fb', backgroundImage: workspace.chatBackgroundImageUrl ? `linear-gradient(rgba(255,255,255,.78), rgba(255,255,255,.78)), url("${workspace.chatBackgroundImageUrl}")` : undefined }}>
              {!dayReady ? <ChatSkeleton /> : chatSearch.trim() && visibleTimeline.length === 0 ? <section className="empty-state chat-empty-state"><Search size={23} /><h3>Không tìm thấy tin nhắn</h3><p>Thử một từ khóa khác trong ngày này nhé.</p></section> : visibleTimeline.length === 0 ? <section className="empty-state chat-empty-state"><Heart size={23} /><h3>Ngày mới, câu chuyện mới</h3><p>{partner ? 'Kể một điều nho nhỏ trong ngày, người ấy sẽ tìm thấy ở đây.' : 'Mời người ấy vào workspace để hai bạn bắt đầu cùng nhau.'}</p></section> : <section className="chat-thread" aria-label="Cuộc trò chuyện trong ngày">{visibleTimeline.map(({ story, entry }, index) => { const previous = visibleTimeline[index - 1]; const continued = previous?.story.author.id === story.author.id; return <StoryCard key={entry.id} story={story} entry={entry} continued={continued} showGapTime={continued && new Date(entry.createdAt).getTime() - new Date(previous.entry.createdAt).getTime() > 30 * 60 * 1000} isLastEntry={entry.id === story.entries.at(-1)?.id} accountId={account.id} busy={busy} replyTarget={replyTarget} replyContent={replyContent} setReplyTarget={setReplyTarget} setReplyContent={setReplyContent} onReply={postReply} onReaction={(emoji) => postReaction(story.id, entry.id, emoji)} onRefresh={() => loadDay(day)} notify={notify} onViewPhoto={setViewedPhoto} />; })}</section>}
            </div>
            <button className="summary-chat-fab" type="button" onClick={() => setSummaryOpen(true)} aria-haspopup="dialog" aria-label="Mở tóm tắt AI cho ngày này" title="Tóm tắt AI">
              <Sparkles size={16} /><span>Tóm tắt AI</span>{summary?.summary && <span className="summary-ready-dot" aria-label="Đã có tóm tắt" />}
            </button>
          </div>
          {page === 'home' && day === todayInVietnam() && <form className="chat-composer" onSubmit={publishStory}>
            {selectedFiles.length > 0 && <div className="composer-attachments" aria-label={`${selectedFiles.length} tệp đã chọn`}>{selectedFiles.map((file, index) => <PhotoPreview key={`${file.name}-${file.size}-${file.lastModified}-${index}`} file={file} onRemove={() => removeSelectedFile(index)} onUseSuggestion={useImageSuggestion} />)}</div>}
            {recording && <div className="recording-status" role="status"><video ref={recordingPreviewRef} className="recording-preview" muted autoPlay playsInline aria-label="Xem trước camera" /><span className="recording-dot" /> Đang quay {String(recordingSeconds).padStart(2, '0')}s / {MAX_VIDEO_SECONDS}s <button className="recording-stop" type="button" onClick={stopVideoRecording} title="Dừng quay" aria-label="Dừng quay"><Square size={13} fill="currentColor" /></button></div>}
            <div className="composer-row">
              <label className="composer-icon" htmlFor="story-files" title="Thêm ảnh" aria-label="Thêm ảnh"><Camera size={19} /></label>
              <input id="story-files" className="file-input" aria-label="Thêm ảnh" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={filesChanged} />
              <input id="story-video" className="file-input" tabIndex={-1} aria-hidden="true" type="file" accept="video/webm,video/mp4,video/quicktime" capture="user" onChange={videoFileChanged} />
              <button className={`composer-icon ${recording ? 'recording-active' : ''}`} type="button" onClick={() => void (recording ? stopVideoRecording() : startVideoRecording())} disabled={busy} title={recording ? 'Dừng quay video' : 'Quay video tối đa 7 giây'} aria-label={recording ? 'Dừng quay video' : 'Quay video tối đa 7 giây'}>{recording ? <Square size={17} fill="currentColor" /> : <Video size={19} />}</button>
              <textarea ref={composerInputRef} className="composer-input" rows={1} maxLength={10000} value={content} onChange={(event) => setContent(event.target.value)} aria-label="Kể chuyện hôm nay" placeholder="Kể người ấy nghe một điều đáng nhớ…" />
              <button className="composer-icon draft-icon" type="submit" name="status" value="DRAFT" disabled={busy || recording} title="Lưu nháp" aria-label="Lưu nháp"><Bookmark size={18} /></button>
              <button className="composer-icon send-icon" type="submit" name="status" value="PUBLISHED" disabled={busy || recording} title="Chia sẻ" aria-label="Chia sẻ">{busy && !recording ? <span className="busy-dot" /> : <Send size={18} />}</button>
            </div>
          </form>}
        </div>
      </>}

      {page === 'calendar' && <section className="calendar-view">
        <header className="calendar-toolbar">
          <div><p className="section-kicker"><CalendarDays size={16} /> Kỷ niệm</p><h2>Những ngày mình nhớ</h2></div>
          <div className="year-stepper" aria-label="Chọn năm">
            <button className="icon-button" type="button" title="Năm trước" aria-label="Năm trước" disabled={calendarYear <= 2000} onClick={() => setCalendarYear((year) => year - 1)}><ChevronLeft size={18} /></button>
            <strong>{calendarYear}</strong>
            <button className="icon-button" type="button" title="Năm sau" aria-label="Năm sau" disabled={calendarYear >= Number(todayInVietnam().slice(0, 4))} onClick={() => setCalendarYear((year) => year + 1)}><ChevronRight size={18} /></button>
          </div>
        </header>
        <AnniversaryManager year={calendarYear} items={anniversaries} gender={account.gender || 'UNSPECIFIED'} onChanged={() => loadCalendar(calendarYear)} notify={notify} timezone={workspace.timezone || 'Asia/Ho_Chi_Minh'} />
        {calendarLoading ? <CalendarSkeleton /> : memoryMonths.length === 0 ? <div className="calendar-empty"><Heart size={24} /><p>Năm {calendarYear} chưa có ngày kỷ niệm nào.</p></div> : <div className="memory-months">
          {memoryMonths.map(([month, memories]) => {
            const [year, monthNumber] = month.split('-').map(Number);
            const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
            const dayCount = daysInMonth;
            const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
            const leadingEmptyDays = (firstWeekday + 6) % 7;
            const weekCount = Math.ceil((leadingEmptyDays + dayCount) / 7);
            const weeks = Array.from({ length: weekCount }, (_, weekIndex) => Array.from({ length: 7 }, (_, weekdayIndex) => {
              const dayNumber = weekIndex * 7 + weekdayIndex - leadingEmptyDays + 1;
              return dayNumber >= 1 && dayNumber <= dayCount ? `${month}-${String(dayNumber).padStart(2, '0')}` : null;
            }));
            const memoriesByDate = new Map(memories.map((memory) => [memory.date, memory]));
            return <section className="memory-month" key={month}>
              <h3>{formatMonth(month)}<span>Sự quan tâm đã kéo dài {memories.length} ngày</span></h3>
              <div className="memory-weeks" aria-label={`Các tuần của ${formatMonth(month)}`}>
                {weeks.map((week, weekIndex) => <div className="memory-week" key={`${month}-week-${weekIndex}`}>
                  {week.map((date, weekdayIndex) => date ? <MemoryTile key={date} date={date} memory={memoriesByDate.get(date) || null} anniversaries={anniversariesByDate.get(date) || []} onOpen={() => { setDay(date); setPage('day'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} /> : <span className="memory-week-empty" key={`${month}-empty-${weekIndex}-${weekdayIndex}`} aria-hidden="true" />)}
                </div>)}
              </div>
            </section>;
          })}
        </div>}
      </section>}

      {page === 'profile' && <ProfilePage account={account} workspace={workspace} partner={partner} busy={busy} inviteUrl={inviteUrl} reminderRevision={reminderRevision} onInvite={createInvitation} notify={notify} onAccount={setAccount} onWorkspace={reloadWorkspace} />}

      {viewedPhoto && <PhotoLightbox key={viewedPhoto.url} photo={viewedPhoto} onClose={closePhoto} />}
      {chatSettingsOpen && <ChatSettingsDialog account={account} workspace={workspace} notify={notify} onAccount={setAccount} onWorkspace={reloadWorkspace} onClose={() => setChatSettingsOpen(false)} />}
      {summaryOpen && <SummaryDialog date={day} summary={summary} busy={summaryBusy} canCreate={canCreateSummary} onCreate={makeSummary} onClose={() => setSummaryOpen(false)} />}

    </main>
  );
}

function AuthScreen({ busy, toast, onSubmit }: { busy: boolean; toast: string; onSubmit: (event: FormEvent<HTMLFormElement>, mode: 'login' | 'register') => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const handle = async (event: FormEvent<HTMLFormElement>) => {
    await onSubmit(event, mode);
  };
  return <main className="auth-wrap">
    <form className="panel auth-card" onSubmit={handle}>
      <div className="auth-title"><span className="brand-mark"><Heart size={25} fill="currentColor" /></span><h1>Trò chuyện với nhau<br />sau 1 ngày dài</h1><p>Một góc nhỏ để mình lắng nghe nhau.</p></div>
      <div className="auth-toggle" data-mode={mode} role="group" aria-label="Chọn cách vào"><button type="button" className={mode === 'login' ? 'active' : ''} aria-pressed={mode === 'login'} onClick={() => setMode('login')}>Đăng nhập</button><button type="button" className={mode === 'register' ? 'active' : ''} aria-pressed={mode === 'register'} onClick={() => setMode('register')}>Tạo tài khoản</button></div>
      <div className="auth-fields">
        {mode === 'register' && <label><span className="field-label">Tên bạn muốn người ấy gọi</span><input className="text-field" name="displayName" autoComplete="name" maxLength={50} required placeholder="Ví dụ: Minh Anh" /></label>}
        <label><span className="field-label">Email</span><input className="text-field" type="email" name="email" autoComplete="email" maxLength={254} required placeholder="ban@email.com" /></label>
        <label><span className="field-label">Mật khẩu</span><input className="text-field" type="password" name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={10} maxLength={128} required placeholder="Ít nhất 10 ký tự" /></label>
        <button className="button button-primary full-button" disabled={busy}>{busy ? 'Đang mở…' : mode === 'login' ? <><LockKeyhole size={16} /> Đăng nhập</> : <><Heart size={16} /> Tạo tài khoản</>}</button>
      </div>
      {toast && <p className="error-text auth-error" role="alert" key={toast}>{toast}</p>}
      <p className="auth-foot">Mỗi người có tài khoản riêng. Sau khi đăng nhập, bạn có thể kết nối bằng lời mời của người ấy.</p>
    </form>
  </main>;
}

function WorkspaceStart({ account, inviteEntry, setInviteEntry, busy, toast, onCreate, onAccept, onLogout }: {
  account: Account; inviteEntry: string; setInviteEntry: (value: string) => void; busy: boolean; toast: string;
  onCreate: (event: FormEvent<HTMLFormElement>) => void; onAccept: (event: FormEvent<HTMLFormElement>) => void; onLogout: () => void;
}) {
  return <main className="shell">{toast && <div className="toast" role="status" key={toast}>{toast}</div>}<header className="topbar"><div className="brand"><span className="brand-mark"><Heart size={21} fill="currentColor" /></span><div><h1>Trò chuyện với nhau sau 1 ngày dài</h1><p>Xin chào, {account.displayName}</p></div></div><button className="icon-button" onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={18} /></button></header>
    <section className="panel workspace-welcome"><span className="section-kicker"><UsersRound size={16} /> Góc nhỏ của hai người</span><h2>Câu chuyện sẽ ở đây khi hai bạn kết nối</h2><p>Tạo một góc nhỏ rồi mời người ấy vào, hoặc dùng link mời của người ấy để tham gia workspace riêng của hai bạn.</p>
      <div className="workspace-grid">
        <form className="workspace-choice" onSubmit={onCreate}><h3><Heart size={16} /> Tạo góc nhỏ</h3><label><span className="field-label">Tên workspace</span><input className="text-field" name="name" maxLength={80} required defaultValue={`Góc nhỏ của ${account.displayName}`} /></label><button className="button button-primary full-button" disabled={busy}>Tạo góc nhỏ</button></form>
        <form className="workspace-choice" onSubmit={onAccept}><h3><UsersRound size={16} /> Tham gia bằng lời mời</h3><label><span className="field-label">Mã hoặc link mời</span><input className="text-field" value={inviteEntry} onChange={(event) => { const value = event.target.value; try { setInviteEntry(value.includes('invite=') ? new URL(value, window.location.origin).searchParams.get('invite') || value : value); } catch { setInviteEntry(value); } }} required placeholder="Dán link hoặc mã mời" /></label><button className="button button-soft full-button" disabled={busy}>Kết nối workspace</button></form>
      </div>
    </section>
  </main>;
}

function SummaryDialog({ date, summary, busy, canCreate, onCreate, onClose }: {
  date: string; summary: SummaryState | null; busy: boolean; canCreate: boolean;
  onCreate: () => void; onClose: () => void;
}) {
  const { panelRef, closing, close } = useModal(onClose);

  return <div className={`dialog-backdrop ${closing ? 'closing' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panelRef} tabIndex={-1} className="summary-dialog" role="dialog" aria-modal="true" aria-labelledby="summary-dialog-title">
      <header className="dialog-heading">
        <div><p className="section-kicker"><Sparkles size={15} /> Gói lại một ngày</p><h2 id="summary-dialog-title">Tóm tắt ngày của hai đứa</h2><p className="summary-dialog-date">{formatDay(date)}</p></div>
        <button className="icon-button" type="button" title="Đóng" aria-label="Đóng tóm tắt" onClick={close}><X size={18} /></button>
      </header>
      <div className={`summary-dialog-content ${summary?.summary ? '' : 'summary-dialog-empty'}`} aria-live="polite" aria-busy={busy}>
        {summary?.summary ? <>{summary.summary}{summary.stale && <p className="summary-hint">Có chia sẻ mới trong ngày. Tạo lại để cập nhật tóm tắt.</p>}</> : <p>{canCreate ? 'AI sẽ tóm tắt những câu chuyện bằng chữ hai bạn đã chia sẻ trong ngày.' : 'Hãy thêm một câu chuyện bằng chữ trong ngày này trước nhé.'}</p>}
      </div>
      <footer className="dialog-actions">
        <button className="button button-quiet" type="button" onClick={close}>Đóng</button>
        <button className="button button-primary" type="button" onClick={onCreate} disabled={busy || !canCreate}><Sparkles size={15} />{busy ? 'Đang tóm tắt…' : summary?.summary ? 'Tạo lại tóm tắt' : 'Tóm tắt ngày này'}</button>
      </footer>
    </section>
  </div>;
}

function formatMemoryWeekday(date: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${date}T00:00:00Z`));
}

function formatMemoryMonthDay(date: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', day: '2-digit', month: 'long' }).format(new Date(`${date}T00:00:00Z`));
}

function MemoryTile({ date, memory, anniversaries, onOpen }: { date: string; memory: CalendarMemory | null; anniversaries: AnniversaryItem[]; onOpen: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <button className={`memory-tile ${memory ? '' : 'memory-tile-empty'} ${anniversaries.length ? 'has-anniversary' : ''}`} type="button" aria-label={`Mở ${formatDay(date)}${memory ? '' : ', chưa có câu chuyện'}${anniversaries.length ? `, ${anniversaries.map((item) => item.title).join(', ')}` : ''}`} onClick={onOpen}>
    <span className="memory-image-area">
      {memory ? memory.coverUrl && !imageFailed ? <img src={memory.coverUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} /> : <span className="memory-placeholder" aria-hidden="true"><Heart size={29} fill="currentColor" /><Sparkles size={15} /></span> : <span className="memory-empty-placeholder" aria-hidden="true"><HeartCrack size={30} fill="white" /></span>}
    </span>
    <span className="memory-date-banner"><strong className="memory-date-number">{Number(date.slice(-2))}</strong><span><b>{formatMemoryWeekday(date)}</b><small>{formatMemoryMonthDay(date)}</small></span></span>
    {anniversaries.length > 0 && <span className="anniversary-badge" title={anniversaries.map((item) => item.title).join(', ')}><CalendarDays size={12} /> {anniversaries.length > 1 ? `${anniversaries.length} ngày` : anniversaries[0].title}</span>}
  </button>;
}

function AnniversaryManager({ year, items, gender, onChanged, notify, timezone }: {
  year: number; items: AnniversaryItem[]; gender: Gender; onChanged: () => Promise<void> | void; notify: (message: string) => void; timezone: string;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(`${year}-01-01`);
  const [note, setNote] = useState('');
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState(false);
  const [suggestionsBusy, setSuggestionsBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<AnniversarySuggestion[]>([]);

  useEffect(() => {
    setDate((current) => current.slice(0, 4) === String(year) ? current : `${year}-01-01`);
  }, [year]);

  const createAnniversary = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/anniversaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, date, note: note.trim() || null, annual }) });
      setTitle('');
      setNote('');
      await onChanged();
      notify('Đã thêm ngày kỷ niệm vào lịch.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa thêm được ngày kỷ niệm.'); }
    finally { setBusy(false); }
  };

  const removeAnniversary = async (item: AnniversaryItem) => {
    if (!window.confirm(`Xóa ngày kỷ niệm “${item.title}”?`)) return;
    try {
      await api(`/anniversaries/${item.id}`, { method: 'DELETE' });
      setSuggestions((current) => current.filter((suggestion) => suggestion.anniversaryId !== item.id));
      await onChanged();
      notify('Đã xóa ngày kỷ niệm.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa xóa được ngày kỷ niệm.'); }
  };

  const loadSuggestions = async () => {
    setSuggestionsBusy(true);
    try {
      const result = await api<{ eligible: boolean; suggestions: AnniversarySuggestion[] }>('/anniversaries/suggestions', { method: 'POST' });
      setSuggestions(result.suggestions || []);
      if (!result.eligible) notify('Gợi ý AI hiện dành cho tài khoản Nam.');
      else if (!result.suggestions?.length) notify('Chưa có ngày sắp tới để AI gợi ý.');
    } catch (error) { notify(error instanceof Error ? error.message : 'AI chưa tạo được gợi ý.'); }
    finally { setSuggestionsBusy(false); }
  };

  const createSuggestionReminder = async (suggestion: AnniversarySuggestion) => {
    if (!suggestion.reminderDate || !suggestion.reminderTime) return;
    try {
      await api('/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `${suggestion.title}: ${suggestion.message}`, date: suggestion.reminderDate, time: suggestion.reminderTime }) });
      notify('Đã tạo lời nhắc từ gợi ý của AI.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa tạo được lời nhắc.'); }
  };

  return <section className="anniversary-manager panel">
    <header className="anniversary-manager-heading"><div><h3><CalendarDays size={17} /> Ngày kỷ niệm</h3><p>Đặt ngày quan trọng để luôn nhìn thấy trong lịch.</p></div>{gender === 'MALE' && <button className="button button-soft" type="button" onClick={() => void loadSuggestions()} disabled={suggestionsBusy || items.length === 0}><Sparkles size={15} /> {suggestionsBusy ? 'Đang gợi ý…' : 'Gợi ý cho mình'}</button>}</header>
    <form className="anniversary-form" onSubmit={createAnniversary}>
      <label><span className="field-label">Tên ngày</span><input className="text-field" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Ngày mình gặp nhau" /></label>
      <div className="anniversary-fields"><label><span className="field-label">Ngày</span><input className="text-field" type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="anniversary-check"><input type="checkbox" checked={annual} onChange={(event) => setAnnual(event.target.checked)} /> Lặp lại hằng năm</label></div>
      <label><span className="field-label">Ghi chú (tuỳ chọn)</span><input className="text-field" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Một điều muốn nhớ về ngày này" /></label>
      <button className="button button-primary" disabled={busy}><Check size={15} /> {busy ? 'Đang lưu…' : 'Thêm vào lịch'}</button>
    </form>
    {items.length > 0 && <div className="anniversary-list"><h4>Đã đặt trong lịch</h4>{items.map((item) => <article className="anniversary-item" key={item.id}><div><strong>{item.title}</strong><time>{item.date}{item.annual ? ' · hằng năm' : ''}</time>{item.note && <p>{item.note}</p>}</div><button className="icon-button" type="button" title={`Xóa ${item.title}`} aria-label={`Xóa ${item.title}`} onClick={() => void removeAnniversary(item)}><Trash2 size={15} /></button></article>)}</div>}
    {gender === 'MALE' && suggestions.length > 0 && <div className="anniversary-suggestions"><h4><Sparkles size={15} /> Gợi ý sắp tới <span>{timezone}</span></h4>{suggestions.map((suggestion) => <article className="anniversary-suggestion" key={suggestion.anniversaryId}><strong>{suggestion.title}</strong><time>{suggestion.date}</time><p>{suggestion.message}</p>{suggestion.reminderDate && suggestion.reminderTime && <button className="button button-soft" type="button" onClick={() => void createSuggestionReminder(suggestion)}><Bell size={14} /> Nhắc ngày {suggestion.reminderDate} lúc {suggestion.reminderTime}</button>}</article>)}</div>}
  </section>;
}

function ChatSettingsDialog({ account, workspace, notify, onAccount, onWorkspace, onClose }: {
  account: Account; workspace: CoupleWorkspace; notify: (message: string) => void;
  onAccount: (value: Account) => void; onWorkspace: () => Promise<CoupleWorkspace | null>; onClose: () => void;
}) {
  const [nickname, setNickname] = useState(account.chatNickname || '');
  const [chatIcon, setChatIcon] = useState(account.chatIcon || CHAT_ICONS[0]);
  const [background, setBackground] = useState(workspace.chatBackground || '#fff7fb');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clearExistingImage, setClearExistingImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const previewUrl = useMemo(() => selectedFile ? URL.createObjectURL(selectedFile) : null, [selectedFile]);
  const imageUrl = previewUrl || (!clearExistingImage ? workspace.chatBackgroundImageUrl : null);

  useEffect(() => {
    if (previewUrl) return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const { panelRef, closing, close } = useModal(onClose);

  const chooseColor = (value: string) => {
    setBackground(value);
    setSelectedFile(null);
    setClearExistingImage(Boolean(workspace.chatBackgroundImageUrl));
  };

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      notify('Ảnh nền cần là JPEG, PNG hoặc WebP và tối đa 10 MB.');
      return;
    }
    setSelectedFile(file);
    setClearExistingImage(false);
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const updatedAccount = await api<Account>('/users/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatNickname: nickname, chatIcon }),
      });
      onAccount(updatedAccount);

      if (selectedFile) {
        const form = new FormData();
        form.set('file', await shrinkImage(selectedFile));
        await api('/media/chat-background', { method: 'POST', body: form });
      } else if (clearExistingImage) {
        await api('/media/chat-background', { method: 'DELETE' });
      }
      await api('/couples/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatBackground: background }) });
      await onWorkspace();
      notify('Cài đặt chat đã được lưu cho hai bạn.');
      close();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Chưa lưu được cài đặt chat.');
    } finally { setBusy(false); }
  };

  return <div className={`dialog-backdrop ${closing ? 'closing' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panelRef} tabIndex={-1} className="chat-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-settings-title">
      <header className="dialog-heading"><div><p className="section-kicker"><Settings2 size={15} /> Tùy chỉnh riêng cho góc nhỏ này</p><h2 id="chat-settings-title">Cài đặt chat</h2></div><button className="icon-button" type="button" title="Đóng" aria-label="Đóng cài đặt chat" onClick={close}><X size={18} /></button></header>
      <form className="chat-settings-form" onSubmit={saveSettings}>
        <section className="chat-setting-section">
          <h3>Hiển thị của mình</h3>
          <label><span className="field-label">Biệt danh trong cuộc trò chuyện</span><input className="text-field" maxLength={32} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder={account.displayName} /></label>
          <fieldset className="icon-field"><legend className="field-label">Icon của mình</legend><div className="chat-icon-picker" role="group" aria-label="Chọn icon của mình">{CHAT_ICONS.map((icon) => <button className="chat-icon-option" type="button" key={icon} aria-label={`Chọn ${icon}`} aria-pressed={chatIcon === icon} onClick={() => setChatIcon(icon)}>{icon}</button>)}</div></fieldset>
        </section>
        <section className="chat-setting-section">
          <h3>Nền cuộc trò chuyện</h3>
          <div className="background-picker" role="group" aria-label="Chọn màu nền chat">{['#fff7fb', '#fff1f2', '#fff7ed', '#f0fdf4', '#eff6ff', '#f5f3ff'].map((color) => <button className="color-swatch" type="button" key={color} aria-label={`Nền ${color}`} aria-pressed={!imageUrl && background === color} style={{ backgroundColor: color }} onClick={() => chooseColor(color)} />)}<label className="custom-color-swatch" title="Chọn màu khác"><input type="color" value={background} aria-label="Màu nền tùy chỉnh" onChange={(event) => chooseColor(event.target.value)} /></label></div>
          {imageUrl && <div className="chat-background-preview"><img src={imageUrl} alt="Xem trước ảnh nền chat" /><button className="photo-remove" type="button" aria-label="Bỏ ảnh nền" title="Bỏ ảnh nền" onClick={() => { setSelectedFile(null); setClearExistingImage(Boolean(workspace.chatBackgroundImageUrl)); }}><X size={16} /></button></div>}
          <div className="button-row"><label className="button button-soft" htmlFor="chat-background-file"><ImagePlus size={16} /> Tải ảnh nền</label><input className="file-input" id="chat-background-file" aria-label="Tải ảnh nền" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />{workspace.chatBackgroundImageUrl && !imageUrl && <span className="muted-small">Đang dùng màu nền</span>}</div>
        </section>
        <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={close} disabled={busy}>Hủy</button><button className="button button-primary" disabled={busy}>{busy ? 'Đang lưu…' : <><Check size={15} /> Lưu cài đặt</>}</button></div>
      </form>
    </section>
  </div>;
}

function PhotoPreview({ file, onRemove, onUseSuggestion }: { file: File; onRemove: () => void; onUseSuggestion: (suggestion: string) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const isVideo = file.type.startsWith('video/');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const requestSuggestion = async () => {
    const form = new FormData();
    form.set('file', file);
    setSuggesting(true);
    setSuggestionError('');
    try {
      const result = await api<{ suggestion: string }>('/media/suggest-caption', { method: 'POST', body: form });
      setSuggestion(result.suggestion);
    } catch (error) { setSuggestionError(error instanceof Error ? error.message : 'AI chưa gợi ý được.'); }
    finally { setSuggesting(false); }
  };

  return <div className="photo-preview-item">
    <div className="photo-preview">
      {previewUrl && (isVideo ? <video src={previewUrl} controls muted playsInline preload="metadata" aria-label={`Xem trước ${file.name}`} /> : <img src={previewUrl} alt={`Xem trước ${file.name}`} />)}
      <button className="photo-remove" type="button" onClick={onRemove} title="Bỏ ảnh này" aria-label={`Bỏ ảnh ${file.name}`}><X size={15} /></button>
    </div>
    {!isVideo && <>
      <button className="photo-suggest-button" type="button" disabled={suggesting} onClick={() => void requestSuggestion()}><Sparkles size={13} />{suggesting ? 'Đang nghĩ…' : 'Gợi ý AI'}</button>
      {suggestion && <div className="photo-suggestion"><p>{suggestion}</p><button className="text-action" type="button" onClick={() => onUseSuggestion(suggestion)}>Thêm vào tin</button></div>}
      {suggestionError && <p className="photo-suggestion-error" role="status">{suggestionError}</p>}
    </>}
  </div>;
}

function StoryCard({ story, entry, continued, showGapTime, isLastEntry, accountId, busy, replyTarget, replyContent, setReplyTarget, setReplyContent, onRefresh, notify, onReply, onReaction, onViewPhoto }: {
  story: DailyStory; entry: DailyStory['entries'][number]; continued: boolean; showGapTime: boolean; isLastEntry: boolean; accountId: string; busy: boolean; replyTarget: string | null; replyContent: string;
  setReplyTarget: (value: string | null) => void; setReplyContent: (value: string) => void;
  onRefresh: () => Promise<void>; notify: (message: string) => void; onReaction: (emoji: string) => Promise<void>;
  onReply: (event: FormEvent<HTMLFormElement>, storyId: string, parentId?: string) => void;
  onViewPhoto: (photo: ViewedPhoto) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const isOwner = story.author.id === accountId;
  const removeStory = async () => {
    if (!window.confirm('Xóa câu chuyện và các bình luận trong ngày này?')) return;
    try { await api(`/stories/${story.id}`, { method: 'DELETE' }); await onRefresh(); notify('Đã xóa câu chuyện.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Chưa xóa được câu chuyện.'); }
  };
  const publishDraft = async () => {
    setSaving(true);
    try { await api(`/stories/${story.id}/publish`, { method: 'POST' }); await onRefresh(); notify('Câu chuyện đã được chia sẻ với người ấy.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Chưa đăng được bản nháp.'); }
    finally { setSaving(false); }
  };
  const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(entry.createdAt));
  const actions = <>{story.status === 'DRAFT' && isLastEntry && <span className="draft-label">Nháp</span>}{isOwner && isLastEntry && <button className="text-action delete-story" type="button" onClick={() => void removeStory()}>Xóa chuyện</button>}</>;
  // Consecutive messages from the same person skip the avatar/name, like Messenger; a long gap still shows the time.
  return <article className={`chat-message ${isOwner ? 'mine' : 'theirs'} ${continued ? 'continued' : ''}`}>
    {continued
      ? (showGapTime || (isLastEntry && (isOwner || story.status === 'DRAFT'))) && <header className="message-meta compact">{showGapTime && <time>{time}</time>}{actions}</header>
      : <header className="message-meta"><Avatar user={story.author} /><span className="chat-user-icon" aria-hidden="true">{story.author.chatIcon || '💗'}</span><div className="message-author"><strong>{chatLabel(story.author)}</strong><time>{time}</time></div>{actions}</header>}
    <div className={`message-group ${isOwner ? 'outgoing' : 'incoming'}`}>
      <div className={`message-entry ${isOwner ? 'outgoing' : 'incoming'}`}>
        {entry.media.length > 0 && <div className={`photo-grid ${entry.media.length === 1 ? 'single-photo' : 'multiple-photos'}`}>{entry.media.map((photo, index) => photo.mimeType.startsWith('video/') ? <div className="video-open" key={photo.id}><video src={photo.url} controls playsInline preload="metadata" aria-label={`Video ${index + 1} trong câu chuyện`} /></div> : <button className="photo-open" type="button" key={photo.id} title="Mở ảnh lớn" aria-label={`Mở ảnh ${index + 1}`} onClick={() => onViewPhoto({ url: photo.url, alt: `Ảnh ${index + 1} trong câu chuyện` })}><img src={photo.url} alt={`Ảnh ${index + 1} trong câu chuyện`} loading="lazy" /></button>)}</div>}
        {entry.content && <div className="message-copy">{entry.content}</div>}
      </div>
    </div>
    {story.status === 'PUBLISHED' && <MessageReactions reactions={entry.reactions || []} onReact={onReaction} />}
    {isOwner && isLastEntry && story.status === 'DRAFT' && <button className="button button-primary draft-publish" type="button" disabled={saving} onClick={() => void publishDraft()}>{saving ? 'Đang chia sẻ…' : 'Chia sẻ với người ấy'}</button>}
    {isLastEntry && story.status === 'PUBLISHED' && <div className={`comments ${commentsOpen ? 'comments-open' : ''}`}>
      <button className="comment-toggle" type="button" aria-expanded={commentsOpen} onClick={() => setCommentsOpen((open) => !open)}><MessageCircle size={15} />{commentsOpen ? 'Ẩn lời nhắn' : story.comments.length ? `${story.comments.length} lời nhắn` : 'Gửi lời nhắn'}<ChevronRight className={commentsOpen ? 'toggle-chevron expanded' : 'toggle-chevron'} size={15} /></button>
      {commentsOpen && <>
        {story.comments.map((comment) => <CommentBlock key={comment.id} comment={comment} storyId={story.id} accountId={accountId} busy={busy} replyTarget={replyTarget} replyContent={replyContent} setReplyTarget={setReplyTarget} setReplyContent={setReplyContent} onReply={onReply} />)}
        <form className="comment-form" onSubmit={(event) => onReply(event, story.id)}><input aria-label="Viết bình luận" value={replyTarget === story.id ? replyContent : ''} onChange={(event) => { setReplyTarget(story.id); setReplyContent(event.target.value); }} placeholder="Gửi người ấy một lời nhắn…" maxLength={2000} /><button className="icon-button" type="submit" disabled={busy} title="Gửi bình luận" aria-label="Gửi bình luận"><ChevronRight size={18} /></button></form>
      </>}
    </div>}
  </article>;
}

function MessageReactions({ reactions, onReact }: { reactions: MessageReaction[]; onReact: (emoji: string) => Promise<void> }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const react = async (emoji: string) => {
    setSaving(true);
    try { await onReact(emoji); setPickerOpen(false); }
    finally { setSaving(false); }
  };

  return <div className="message-reactions">
    {reactions.map((reaction) => <button className={`reaction-pill ${reaction.reacted ? 'selected' : ''}`} type="button" key={reaction.emoji} disabled={saving} aria-pressed={reaction.reacted} aria-label={`${reaction.emoji}, ${reaction.count} phản ứng`} onClick={() => void react(reaction.emoji)}>{reaction.emoji}<span>{reaction.count}</span></button>)}
    <button className="reaction-trigger" type="button" disabled={saving} aria-expanded={pickerOpen} aria-label="Thả icon vào tin nhắn" title="Thả icon" onClick={() => setPickerOpen((open) => !open)}><SmilePlus size={13} /></button>
    {pickerOpen && <div className="reaction-picker" role="group" aria-label="Chọn icon thả vào tin nhắn">{MESSAGE_REACTIONS.map((emoji) => <button type="button" key={emoji} disabled={saving} aria-label={emoji} onClick={() => void react(emoji)}>{emoji}</button>)}</div>}
  </div>;
}

function PhotoLightbox({ photo, onClose }: { photo: ViewedPhoto; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const { panelRef, closing, close } = useModal(onClose);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomBy = useCallback((amount: number) => setZoom((current) => Math.max(0.5, Math.min(4, Number((current + amount).toFixed(2))))), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '+' || event.key === '=') zoomBy(0.25);
      if (event.key === '-') zoomBy(-0.25);
      if (event.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomBy]);

  // React's onWheel is passive, so preventDefault there is ignored and the stage scrolls while zooming.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 0.15 : -0.15); };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  return <div className={`photo-lightbox ${closing ? 'closing' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panelRef} tabIndex={-1} className="photo-lightbox-panel" role="dialog" aria-modal="true" aria-label="Xem ảnh">
      <button className="photo-lightbox-button photo-lightbox-close" type="button" onClick={close} title="Đóng ảnh" aria-label="Đóng ảnh"><X size={20} /></button>
      <div ref={stageRef} className="photo-lightbox-stage">
        <img className="photo-lightbox-image" src={photo.url} alt={photo.alt} style={{ transform: `scale(${zoom})` }} />
      </div>
      <div className="photo-lightbox-controls" aria-label="Điều chỉnh kích thước ảnh">
        <button className="photo-lightbox-button" type="button" onClick={() => zoomBy(-0.25)} disabled={zoom <= 0.5} title="Thu nhỏ" aria-label="Thu nhỏ"><ZoomOut size={18} /></button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button className="photo-lightbox-button" type="button" onClick={() => zoomBy(0.25)} disabled={zoom >= 4} title="Phóng to" aria-label="Phóng to"><ZoomIn size={18} /></button>
        <button className="photo-lightbox-button" type="button" onClick={() => setZoom(1)} disabled={zoom === 1} title="Vừa màn hình" aria-label="Vừa màn hình"><RotateCcw size={17} /></button>
      </div>
    </section>
  </div>;
}

function ChatSkeleton() {
  return <div className="chat-skeleton" role="status" aria-label="Đang tải cuộc trò chuyện">
    {['theirs', 'mine', 'theirs'].map((side, index) => <div className={`skeleton-bubble ${side}`} key={index}><span className="skeleton skeleton-avatar" /><span className="skeleton skeleton-line" /></div>)}
  </div>;
}

function CalendarSkeleton() {
  return <div className="memory-months" role="status" aria-label="Đang mở kỷ niệm">
    <section className="memory-month">
      <span className="skeleton skeleton-heading" />
      <div className="memory-week-skeleton">{Array.from({ length: 14 }, (_, index) => <span className="skeleton skeleton-tile" key={index} style={{ animationDelay: `${index * 40}ms` }} />)}</div>
    </section>
  </div>;
}

function CommentBlock({ comment, storyId, accountId, busy, replyTarget, replyContent, setReplyTarget, setReplyContent, onReply }: {
  comment: CommentItem; storyId: string; accountId: string; busy: boolean; replyTarget: string | null; replyContent: string;
  setReplyTarget: (value: string | null) => void; setReplyContent: (value: string) => void;
  onReply: (event: FormEvent<HTMLFormElement>, storyId: string, parentId?: string) => void;
}) {
  return <div className="comment"><strong>{comment.author.chatIcon || '💗'} {chatLabel(comment.author)}:</strong> {comment.content}
    {comment.replies.map((reply) => <div className="comment-reply" key={reply.id}><strong>{reply.author.chatIcon || '💗'} {chatLabel(reply.author)}:</strong> {reply.content}</div>)}
    {replyTarget === comment.id ? <form className="comment-form" onSubmit={(event) => onReply(event, storyId, comment.id)}><input aria-label="Trả lời bình luận" autoFocus value={replyContent} onChange={(event) => setReplyContent(event.target.value)} placeholder="Viết câu trả lời…" maxLength={2000} /><button className="icon-button" disabled={busy} title="Gửi trả lời" aria-label="Gửi trả lời"><ChevronRight size={18} /></button></form> : <button className="text-action" onClick={() => { setReplyTarget(comment.id); setReplyContent(''); }}>Trả lời</button>}
  </div>;
}

function ProfilePage({ account, workspace, partner, busy, inviteUrl, reminderRevision, onInvite, notify, onAccount, onWorkspace }: {
  account: Account; workspace: CoupleWorkspace; partner: UserProfile | null; busy: boolean; inviteUrl: string; reminderRevision: number;
  onInvite: () => void;
  notify: (message: string) => void; onAccount: (value: Account) => void; onWorkspace: () => Promise<CoupleWorkspace | null>;
}) {
  const [name, setName] = useState(account.displayName);
  const [bio, setBio] = useState(account.bio || '');
  const [gender, setGender] = useState<Gender>(account.gender || 'UNSPECIFIED');
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const initialSchedule = useMemo(() => defaultReminderDateTime(workspace.timezone || 'Asia/Ho_Chi_Minh'), [workspace.timezone]);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState(initialSchedule.date);
  const [reminderTime, setReminderTime] = useState(initialSchedule.time);
  const [planPrompt, setPlanPrompt] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [planMessages, setPlanMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [planSuggestion, setPlanSuggestion] = useState<{ title: string; date: string; time: string } | null>(null);

  const loadReminders = useCallback(async () => {
    setRemindersBusy(true);
    try { setReminders(await api<ReminderItem[]>('/reminders')); }
    catch (error) { notify(error instanceof Error ? error.message : 'Chưa tải được lời nhắc.'); }
    finally { setRemindersBusy(false); }
  }, [notify]);

  useEffect(() => { void loadReminders(); }, [loadReminders, reminderRevision]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const updated = await api<Account>('/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: name, bio, gender }) });
      onAccount(updated);
      notify('Hồ sơ của bạn đã được cập nhật.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa lưu được hồ sơ.'); }
  };
  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    setUploadBusy(true);
    try {
      form.set('file', await shrinkImage(file, 1024));
      const updated = await api<Account>('/users/me/avatar', { method: 'POST', body: form });
      onAccount(updated);
      notify('Ảnh đại diện đã được thay đổi.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa tải được ảnh.'); }
    finally { setUploadBusy(false); event.target.value = ''; }
  };
  const clearAvatar = async () => {
    try { onAccount(await api<Account>('/users/me/avatar', { method: 'DELETE' })); notify('Đã trở về ảnh đại diện mặc định.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Chưa xóa được ảnh.'); }
  };
  const saveWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api('/couples/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: workspaceName }) });
      await onWorkspace();
      notify('Cài đặt góc nhỏ đã được cập nhật.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa lưu được tên workspace.'); }
  };

  const saveReminder = async (title: string, date: string, time: string) => {
    try {
      await api<ReminderItem>('/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, date, time }) });
      setReminderTitle('');
      setPlanSuggestion(null);
      await loadReminders();
      notify('Đã tạo lời nhắc cho hai bạn.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa tạo được lời nhắc.'); }
  };

  const createReminder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveReminder(reminderTitle, reminderDate, reminderTime);
  };

  const planReminder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = planPrompt.trim();
    if (!prompt) return;
    const context = planMessages.map((message) => `${message.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${message.content}`).join('\n').slice(-3800);
    setPlanBusy(true);
    setPlanPrompt('');
    setPlanSuggestion(null);
    try {
      const result = await api<{ title: string; date: string | null; time: string | null; question: string }>('/reminders/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, context }) });
      const assistantText = result.question || (result.date && result.time ? 'Mình đã tìm được thời điểm phù hợp. Kiểm tra đề xuất bên dưới rồi xác nhận nhé.' : 'Bạn cho mình biết rõ ngày và giờ muốn nhắc nhé.');
      setPlanMessages((messages) => [...messages, { role: 'user', content: prompt }, { role: 'assistant', content: assistantText }]);
      if (result.title && result.date && result.time) setPlanSuggestion({ title: result.title, date: result.date, time: result.time });
    } catch (error) {
      setPlanMessages((messages) => [...messages, { role: 'user', content: prompt }, { role: 'assistant', content: error instanceof Error ? error.message : 'AI chưa lập được lịch.' }]);
    } finally { setPlanBusy(false); }
  };

  const completeReminder = async (id: string) => {
    try { await api(`/reminders/${id}/complete`, { method: 'PATCH' }); await loadReminders(); }
    catch (error) { notify(error instanceof Error ? error.message : 'Chưa hoàn tất được lời nhắc.'); }
  };

  const removeReminder = async (reminder: ReminderItem) => {
    if (!window.confirm(`Xóa lời nhắc “${reminder.title}”?`)) return;
    try { await api(`/reminders/${reminder.id}`, { method: 'DELETE' }); await loadReminders(); notify('Đã xóa lời nhắc.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Chưa xóa được lời nhắc.'); }
  };
  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPasswordBusy(true);
    try {
      await api('/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') }) });
      formElement.reset();
      notify('Mật khẩu đã được thay đổi.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa đổi được mật khẩu.'); }
    finally { setPasswordBusy(false); }
  };
  return <>
    <section className="panel profile-head"><Avatar user={account} /><div><h2>{account.displayName}</h2><p>{account.email}</p><p className="profile-chat-label">{account.chatIcon || CHAT_ICONS[0]} {account.chatNickname?.trim() || 'Tên hiển thị trong chat'}</p></div></section>
    <section className="panel settings-card">
      <h3>Hồ sơ của mình</h3>
      <form className="profile-form" onSubmit={saveProfile}>
        <label><span className="field-label">Tên hiển thị</span><input className="text-field" maxLength={50} required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span className="field-label">Giới tính</span><select className="text-field" value={gender} onChange={(event) => setGender(event.target.value as Gender)}><option value="UNSPECIFIED">Chưa chọn</option><option value="MALE">Nam</option><option value="FEMALE">Nữ</option><option value="OTHER">Khác</option></select></label>
        <label><span className="field-label">Một chút về mình</span><textarea className="text-field profile-bio" maxLength={200} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Một điều bạn muốn người ấy biết…" /></label>
        <div className="button-row"><button className="button button-primary" disabled={busy}><Check size={15} /> Lưu hồ sơ</button><label className="button button-soft" htmlFor="avatar-file"><Camera size={15} /> {uploadBusy ? 'Đang tải…' : 'Đổi ảnh'}</label><input className="file-input" id="avatar-file" aria-label="Đổi ảnh đại diện" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} />{account.avatarUrl && <button type="button" className="button button-quiet" onClick={() => void clearAvatar()}>Xóa ảnh</button>}</div>
      </form>
    </section>
    <section className="panel settings-card"><h3>Bảo mật tài khoản</h3><form className="profile-form" onSubmit={changePassword}><label><span className="field-label">Mật khẩu hiện tại</span><input className="text-field" type="password" name="currentPassword" minLength={10} maxLength={128} required autoComplete="current-password" /></label><label><span className="field-label">Mật khẩu mới</span><input className="text-field" type="password" name="newPassword" minLength={10} maxLength={128} required autoComplete="new-password" /></label><button className="button button-soft" disabled={passwordBusy}>Đổi mật khẩu</button></form></section>
    <section className="panel settings-card">
      <h3>Góc nhỏ của hai đứa</h3>
      <form className="profile-form" onSubmit={saveWorkspace}>
        <label><span className="field-label">Tên workspace</span><input className="text-field" maxLength={80} required value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /></label>
        <button className="button button-soft"><Check size={15} /> Lưu cài đặt</button>
      </form>
      <div className="members-row"><div><Avatar user={account} /><span>{account.chatNickname?.trim() || account.displayName}</span></div><Heart size={19} fill="currentColor" /><div>{partner ? <><Avatar user={partner} /><span>{partner.chatNickname?.trim() || partner.displayName}</span></> : <span>Đang chờ người ấy tham gia</span>}</div></div>
      {!partner && <div className="invite-actions"><button className="button button-primary" type="button" onClick={onInvite} disabled={busy}>Mời người ấy</button>{inviteUrl && <div className="invite-link-row"><input className="text-field" readOnly value={inviteUrl} aria-label="Link mời" /><button className="button button-soft" type="button" onClick={() => { void navigator.clipboard.writeText(inviteUrl).then(() => notify('Đã sao chép link mời.')).catch(() => notify('Hãy chọn và sao chép link mời.')); }}>Sao chép</button></div>}</div>}
    </section>
    <section className="panel settings-card reminders-card">
      <header className="reminders-heading"><div><h3><Bell size={17} /> Lời nhắc của hai đứa</h3><p>Múi giờ workspace: {workspace.timezone || 'Asia/Ho_Chi_Minh'}</p></div></header>
      <form className="reminder-form" onSubmit={createReminder}>
        <label><span className="field-label">Nội dung lời nhắc</span><input className="text-field" maxLength={160} required value={reminderTitle} onChange={(event) => setReminderTitle(event.target.value)} placeholder="Ví dụ: gọi cho nhau sau giờ làm" /></label>
        <div className="reminder-datetime">
          <label><span className="field-label">Ngày</span><input className="text-field" type="date" required value={reminderDate} onChange={(event) => setReminderDate(event.target.value)} /></label>
          <label><span className="field-label">Giờ</span><input className="text-field" type="time" required value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} /></label>
        </div>
        <button className="button button-primary"><Bell size={15} /> Tạo lời nhắc</button>
      </form>
      <div className="planner">
        <h4><Sparkles size={16} /> Nhờ AI sắp lịch</h4>
        <div className="planner-messages" aria-live="polite">
          {planMessages.length === 0 ? <p className="planner-empty">Bạn muốn được nhắc việc gì, vào lúc nào?</p> : planMessages.map((message, index) => <p className={`planner-message ${message.role}`} key={`${message.role}-${index}`}>{message.content}</p>)}
        </div>
        {planSuggestion && <div className="planner-suggestion"><strong>{planSuggestion.title}</strong><span>{planSuggestion.date} · {planSuggestion.time}</span><button className="button button-soft" type="button" onClick={() => void saveReminder(planSuggestion.title, planSuggestion.date, planSuggestion.time)}><Check size={15} /> Tạo lời nhắc này</button></div>}
        <form className="planner-form" onSubmit={planReminder}><input className="text-field" maxLength={2000} value={planPrompt} onChange={(event) => setPlanPrompt(event.target.value)} placeholder="Ví dụ: nhắc mình gọi mẹ tối mai lúc 8 giờ" aria-label="Mô tả lịch cần tạo" /><button className="icon-button" disabled={planBusy || !planPrompt.trim()} aria-label="Gửi yêu cầu cho AI" title="Gửi yêu cầu cho AI">{planBusy ? <span className="busy-dot" /> : <Send size={17} />}</button></form>
      </div>
      <div className="reminder-list" aria-live="polite">
        <h4>Lời nhắc sắp tới</h4>
        {remindersBusy ? <p className="muted-small">Đang tải lời nhắc…</p> : reminders.length === 0 ? <p className="muted-small">Chưa có lời nhắc nào.</p> : reminders.map((reminder) => {
          const due = Date.parse(reminder.scheduledAt) <= Date.now();
          return <article className={`reminder-item ${due ? 'due' : ''}`} key={reminder.id}>
            <div className="reminder-copy"><strong>{reminder.title}</strong><time>{formatReminderTime(reminder.scheduledAt, workspace.timezone || 'Asia/Ho_Chi_Minh')}{due ? ' · Đến giờ' : ''}</time></div>
            <button className="reminder-action" type="button" title="Đánh dấu hoàn tất" aria-label={`Hoàn tất: ${reminder.title}`} onClick={() => void completeReminder(reminder.id)}><Check size={16} /></button>
            <button className="reminder-action remove" type="button" title="Xóa lời nhắc" aria-label={`Xóa: ${reminder.title}`} onClick={() => void removeReminder(reminder)}><Trash2 size={15} /></button>
          </article>;
        })}
      </div>
    </section>
  </>;
}
