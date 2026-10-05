'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import { api, formatMonth, prefersReducedMotion, useModal } from './shared';

type RecapPhoto = { id: string; url: string; date: string; createdAt: string; authorId: string; caption: string };
type RecapPerson = { id: string; name: string; icon: string; messages: number; photos: number; replies: number; reactions: number };
type Recap = { month: string; days: number; photos: RecapPhoto[]; people: RecapPerson[] };
type Segment = { kind: 'intro' | 'photo' | 'outro'; start: number; duration: number; photo?: RecapPhoto };

// Half a second per photo reads as a quick "flip through the month": the brain gets the gist of
// a picture in well under 100 ms, while classic slideshows (3–5 s a photo) would make a month of
// photos drag. The first and last photo are held longer so the video has room to breathe.
const SPEEDS = [
  { label: 'Nhanh', ms: 300 },
  { label: '0,5 giây', ms: 500 },
  { label: '1 giây', ms: 1000 },
  { label: 'Chậm', ms: 2000 },
];
const DEFAULT_PHOTO_MS = 500;
const HOLD_MS = 1500;
const INTRO_MS = 2600;
const OUTRO_MS = 3400;
const WIDTH = 720;
const HEIGHT = 900;

function buildSegments(photos: RecapPhoto[], photoMs: number) {
  const segments: Segment[] = [{ kind: 'intro', start: 0, duration: INTRO_MS }];
  let cursor = INTRO_MS;
  photos.forEach((photo, index) => {
    const duration = index === 0 || index === photos.length - 1 ? Math.max(photoMs, HOLD_MS) : photoMs;
    segments.push({ kind: 'photo', start: cursor, duration, photo });
    cursor += duration;
  });
  segments.push({ kind: 'outro', start: cursor, duration: OUTRO_MS });
  return { segments, total: cursor + OUTRO_MS };
}

function formatShortDay(date: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', day: '2-digit', month: 'long' }).format(new Date(`${date}T00:00:00Z`));
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
    else line = next;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.{0,2}$/, '')}…`;
  return lines;
}

function drawCard(context: CanvasRenderingContext2D, recap: Recap, kind: 'intro' | 'outro', progress: number) {
  const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#fce7f3');
  gradient.addColorStop(1, '#f9a8d4');
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.globalAlpha = Math.min(1, progress * 3);
  context.textAlign = 'center';
  context.fillStyle = '#be185d';
  context.font = '600 30px "Be Vietnam Pro", system-ui, sans-serif';
  context.fillText(kind === 'intro' ? 'Nhìn lại' : 'Cảm ơn vì đã quan tâm nhau', WIDTH / 2, 300);
  context.fillStyle = '#4a2535';
  context.font = '700 58px "Be Vietnam Pro", system-ui, sans-serif';
  context.fillText(kind === 'intro' ? formatMonth(recap.month) : `${recap.days} ngày`, WIDTH / 2, 380);
  context.font = '500 26px "Be Vietnam Pro", system-ui, sans-serif';
  context.fillStyle = '#795563';
  if (kind === 'intro') {
    context.fillText(`${recap.days} ngày kể nhau nghe · ${recap.photos.length} tấm ảnh`, WIDTH / 2, 440);
  } else {
    recap.people.forEach((person, index) => {
      const y = 470 + index * 92;
      context.fillStyle = '#4a2535';
      context.font = '600 28px "Be Vietnam Pro", system-ui, sans-serif';
      context.fillText(`${person.icon} ${person.name}`, WIDTH / 2, y);
      context.fillStyle = '#795563';
      context.font = '500 22px "Be Vietnam Pro", system-ui, sans-serif';
      context.fillText(`${person.messages} lời kể · ${person.photos} ảnh · ${person.replies} lời nhắn · ${person.reactions} lần thả tim`, WIDTH / 2, y + 36);
    });
  }
  context.globalAlpha = 1;
}

function drawPhoto(context: CanvasRenderingContext2D, image: HTMLImageElement | undefined, photo: RecapPhoto, progress: number, people: Map<string, RecapPerson>) {
  context.fillStyle = '#1f1218';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  if (image?.complete && image.naturalWidth) {
    // Cover the frame, with a slow push-in so fast cuts still feel alive.
    const zoom = 1 + 0.06 * progress;
    const scale = Math.max(WIDTH / image.naturalWidth, HEIGHT / image.naturalHeight) * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
  }
  const shade = context.createLinearGradient(0, HEIGHT - 260, 0, HEIGHT);
  shade.addColorStop(0, 'rgba(31, 18, 24, 0)');
  shade.addColorStop(1, 'rgba(31, 18, 24, .78)');
  context.fillStyle = shade;
  context.fillRect(0, HEIGHT - 260, WIDTH, 260);
  context.textAlign = 'left';
  context.fillStyle = '#ffffff';
  context.font = '700 34px "Be Vietnam Pro", system-ui, sans-serif';
  const person = people.get(photo.authorId);
  context.fillText(`${formatShortDay(photo.date)}${person ? `  ${person.icon}` : ''}`, 36, HEIGHT - 92);
  if (photo.caption) {
    context.font = '500 22px "Be Vietnam Pro", system-ui, sans-serif';
    context.fillStyle = 'rgba(255, 255, 255, .88)';
    wrapText(context, photo.caption, WIDTH - 72, 1).forEach((line) => context.fillText(line, 36, HEIGHT - 50));
  }
}

export function MonthRecap({ month, onClose }: { month: string; onClose: () => void }) {
  const { panelRef, closing, close } = useModal(onClose);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const frameRef = useRef<number | null>(null);
  // offset = time already played; seekTo = a jump that the running clock must take instead of adding its own time.
  const clockRef = useRef<{ startedAt: number; offset: number; seekTo: number | null }>({ startedAt: 0, offset: 0, seekTo: null });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [error, setError] = useState('');
  const [photoMs, setPhotoMs] = useState(DEFAULT_PHOTO_MS);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    api<Recap>(`/stories/recap?month=${month}`)
      .then((result) => {
        if (!active) return;
        setRecap(result);
        for (const photo of result.photos) {
          const image = new Image();
          image.decoding = 'async';
          image.src = photo.url;
          imagesRef.current.set(photo.id, image);
        }
        setPlaying(!prefersReducedMotion());
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Chưa tải được ảnh của tháng.'); });
    return () => { active = false; };
  }, [month]);

  const timeline = useMemo(() => buildSegments(recap?.photos || [], photoMs), [recap, photoMs]);
  const people = useMemo(() => new Map((recap?.people || []).map((person) => [person.id, person])), [recap]);

  const draw = useCallback((time: number) => {
    const context = canvasRef.current?.getContext('2d');
    if (!context || !recap) return;
    const segment = timeline.segments.find((item) => time < item.start + item.duration) || timeline.segments[timeline.segments.length - 1];
    const progress = Math.min(1, (time - segment.start) / segment.duration);
    if (segment.kind === 'photo' && segment.photo) drawPhoto(context, imagesRef.current.get(segment.photo.id), segment.photo, progress, people);
    else drawCard(context, recap, segment.kind === 'intro' ? 'intro' : 'outro', progress);
  }, [recap, timeline, people]);

  // Redraw the still frame whenever paused content changes (speed, seek, first load).
  useEffect(() => { if (!playing) draw(elapsed); }, [draw, elapsed, playing]);

  useEffect(() => {
    if (!playing || !recap) return;
    const clock = clockRef.current;
    if (clock.seekTo !== null) { clock.offset = clock.seekTo; clock.seekTo = null; }
    clock.startedAt = performance.now();
    const tick = (now: number) => {
      const time = clockRef.current.offset + (now - clockRef.current.startedAt);
      if (time >= timeline.total) {
        draw(timeline.total - 1);
        clockRef.current.seekTo = timeline.total;
        setElapsed(timeline.total);
        setPlaying(false);
        recorderRef.current?.stop();
        return;
      }
      draw(time);
      setElapsed(time);
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (clock.seekTo !== null) { clock.offset = clock.seekTo; clock.seekTo = null; }
      else clock.offset += performance.now() - clock.startedAt;
    };
  }, [playing, recap, timeline, draw]);

  useEffect(() => () => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); }, []);

  const restart = () => {
    clockRef.current.seekTo = 0;
    clockRef.current.offset = 0;
    setElapsed(0);
    setPlaying(false);
    window.requestAnimationFrame(() => setPlaying(true));
  };

  const togglePlay = () => {
    if (elapsed >= timeline.total) { restart(); return; }
    setPlaying((value) => !value);
  };

  const changeSpeed = (ms: number) => {
    // Keep the viewer on the same photo when the pace changes.
    const segment = timeline.segments.find((item) => elapsed < item.start + item.duration);
    const next = buildSegments(recap?.photos || [], ms);
    const match = segment?.photo ? next.segments.find((item) => item.photo?.id === segment.photo?.id) : null;
    const target = match ? match.start : Math.min(elapsed, next.total);
    clockRef.current.seekTo = target;
    clockRef.current.offset = target;
    setElapsed(target);
    setPhotoMs(ms);
  };

  const saveVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !recap || typeof MediaRecorder === 'undefined' || !canvas.captureStream) { setError('Trình duyệt này chưa hỗ trợ lưu video.'); return; }
    const mimeType = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) { setError('Trình duyệt này chưa hỗ trợ lưu video.'); return; }
    // Make sure every photo is decoded so recorded frames are never blank.
    await Promise.all(Array.from(imagesRef.current.values()).map((image) => image.decode().catch(() => undefined)));
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType, videoBitsPerSecond: 4_000_000 });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      recorderRef.current = null;
      setExporting(false);
      const type = mimeType.split(';')[0];
      const url = URL.createObjectURL(new Blob(chunks, { type }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `nhin-lai-${recap.month}.${type === 'video/mp4' ? 'mp4' : 'webm'}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };
    setExporting(true);
    recorder.start(250);
    restart();
  };

  const currentPhotoIndex = recap ? timeline.segments.findIndex((item) => elapsed < item.start + item.duration) - 1 : -1;

  return <div className={`dialog-backdrop recap-backdrop ${closing ? 'closing' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panelRef} tabIndex={-1} className="recap-dialog" role="dialog" aria-modal="true" aria-labelledby="recap-title">
      <header className="dialog-heading">
        <div><p className="section-kicker"><Sparkles size={15} /> Một tháng quan tâm nhau</p><h2 id="recap-title">Nhìn lại {formatMonth(month)}</h2></div>
        <button className="icon-button" type="button" title="Đóng" aria-label="Đóng video tháng" onClick={close}><X size={18} /></button>
      </header>
      {error ? <p className="error-text" role="alert">{error}</p> : !recap ? <div className="recap-stage recap-loading" role="status">Đang gom ảnh của tháng…</div> : <>
        <div className="recap-stage">
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} onClick={togglePlay} aria-label={`Video nhìn lại ${formatMonth(month)}, ${recap.photos.length} ảnh`} />
        </div>
        <div className="recap-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, (elapsed / timeline.total) * 100)}%` }} /></div>
        <div className="recap-controls">
          <button className="icon-button" type="button" onClick={togglePlay} disabled={exporting} aria-label={playing ? 'Tạm dừng' : 'Phát'} title={playing ? 'Tạm dừng' : 'Phát'}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
          <button className="icon-button" type="button" onClick={restart} disabled={exporting} aria-label="Xem lại từ đầu" title="Xem lại từ đầu"><RotateCcw size={17} /></button>
          <span className="recap-counter">{Math.max(0, Math.min(currentPhotoIndex + 1, recap.photos.length))}/{recap.photos.length} ảnh</span>
          <div className="recap-speed" role="group" aria-label="Thời gian mỗi ảnh">
            {SPEEDS.map((speed) => <button key={speed.ms} type="button" disabled={exporting} aria-pressed={photoMs === speed.ms} onClick={() => changeSpeed(speed.ms)}>{speed.label}</button>)}
          </div>
          <button className="button button-soft recap-save" type="button" onClick={() => void saveVideo()} disabled={exporting || recap.photos.length === 0}><Download size={15} /> {exporting ? 'Đang ghi video…' : 'Lưu video'}</button>
        </div>
      </>}
    </section>
  </div>;
}
