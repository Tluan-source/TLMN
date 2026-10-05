'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import type { AnniversaryItem, DailyStory, UserProfile } from '@chuyen/contracts';
import type { ViewedPhoto } from './shared';
import { formatDay, prefersReducedMotion, vietnamDayOf } from './shared';

type BoardPhoto = { id: string; url: string; isVideo: boolean; author: UserProfile; time: string };
type BoardNote = { id: string; kind: 'entry' | 'comment' | 'anniversary'; text: string; author?: UserProfile; time?: string };
type BoardColumn = { key: string; photo: BoardPhoto | null; notes: BoardNote[] };

// Column width and the band at the top of the board where photos hang from the string.
const SLOT = 172;
const SIDE = 36;
const STRING_ANCHOR_Y = 26;
const NOTE_COLORS = ['note-pink', 'note-white', 'note-butter', 'note-mint'];

/** Small stable number from an id, so a photo keeps the same tilt every time the board opens. */
function seeded(id: string, salt = 0) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

function authorLabel(user: UserProfile) {
  return user.chatNickname?.trim() || user.displayName;
}

function clock(value: string, viewDay: string) {
  const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  return vietnamDayOf(value) > viewDay ? `${time} rạng sáng` : time;
}

/** One column per photo; a message is pinned under the first photo it came with, or gets its own column. */
function buildColumns(day: string, stories: DailyStory[], anniversaries: AnniversaryItem[]) {
  const published = stories.filter((story) => story.status === 'PUBLISHED');
  const timeline = published
    .flatMap((story) => story.entries.map((entry) => ({ story, entry })))
    .sort((left, right) => Date.parse(left.entry.createdAt) - Date.parse(right.entry.createdAt) || left.entry.id.localeCompare(right.entry.id));
  const columns: BoardColumn[] = anniversaries.length
    ? [{ key: 'anniversary', photo: null, notes: anniversaries.map((item) => ({ id: item.id, kind: 'anniversary', text: item.note ? `${item.title} · ${item.note}` : item.title })) }]
    : [];
  const lastColumnOfStory = new Map<string, BoardColumn>();
  for (const { story, entry } of timeline) {
    const time = clock(entry.createdAt, day);
    const note: BoardNote | null = entry.content.trim() ? { id: entry.id, kind: 'entry', text: entry.content.trim(), author: story.author, time } : null;
    if (entry.media.length === 0) {
      if (!note) continue;
      const column = { key: entry.id, photo: null, notes: [note] };
      columns.push(column);
      lastColumnOfStory.set(story.id, column);
      continue;
    }
    entry.media.forEach((item, index) => {
      const column: BoardColumn = {
        key: item.id,
        photo: { id: item.id, url: item.url, isVideo: item.mimeType.startsWith('video/'), author: story.author, time },
        notes: index === 0 && note ? [note] : [],
      };
      columns.push(column);
      lastColumnOfStory.set(story.id, column);
    });
  }
  // Replies from the chat ("lời nhắn") go on small sticky notes beside the story they answer.
  for (const story of published) {
    const column = lastColumnOfStory.get(story.id);
    if (!column) continue;
    for (const comment of story.comments) {
      column.notes.push({ id: comment.id, kind: 'comment', text: comment.content, author: comment.author, time: clock(comment.createdAt, day) });
      for (const reply of comment.replies) column.notes.push({ id: reply.id, kind: 'comment', text: reply.content, author: reply.author, time: clock(reply.createdAt, day) });
    }
  }
  return columns;
}

/**
 * A hanging rope takes the shape of a catenary, y = a·cosh(x/a). Solve for `a` so the curve
 * sags `sag` px below the straight line over a span of `span` px.
 */
function catenaryParameter(span: number, sag: number) {
  let low = span / 100;
  let high = span * 100;
  for (let step = 0; step < 50; step += 1) {
    const middle = (low + high) / 2;
    if (middle * (Math.cosh(span / (2 * middle)) - 1) > sag) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** The rope dips under its own weight between every clip, like the sketch: deeper over longer gaps. */
function ropePath(points: { x: number; y: number }[]) {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const span = to.x - from.x;
    if (span <= 0) continue;
    const sag = Math.min(80, span * 0.16);
    const a = catenaryParameter(span, sag);
    const lowest = Math.cosh(span / (2 * a));
    for (let x = 6; x < span; x += 6) {
      const chord = from.y + ((to.y - from.y) * x) / span;
      const dip = a * (lowest - Math.cosh((x - span / 2) / a));
      path += ` L ${(from.x + x).toFixed(1)} ${(chord + dip).toFixed(1)}`;
    }
    path += ` L ${to.x} ${to.y}`;
  }
  return path;
}

export function MemoryBoard({ day, stories, ready, anniversaries, onBack, onOpenChat, onViewPhoto }: {
  day: string; stories: DailyStory[]; ready: boolean; anniversaries: AnniversaryItem[];
  onBack: () => void; onOpenChat: () => void; onViewPhoto: (photo: ViewedPhoto) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [edges, setEdges] = useState({ start: true, end: true });
  const columns = useMemo(() => buildColumns(day, stories, anniversaries), [day, stories, anniversaries]);
  const width = Math.max(columns.length, 1) * SLOT + SIDE * 2;

  // The whole rope hangs from a nail at each end, so clips near the middle sit lower;
  // each photo's weight then pulls its clip down a little more.
  const pins = useMemo(() => {
    const overallSag = Math.min(64, width * 0.045);
    return columns.flatMap((column, index) => {
      if (!column.photo) return [];
      const x = SIDE + index * SLOT + SLOT / 2;
      const along = x / width;
      return [{ key: column.key, x, y: Math.round(STRING_ANCHOR_Y + 22 + overallSag * 4 * along * (1 - along) + seeded(column.key) * 12) }];
    });
  }, [columns, width]);
  const pinByKey = useMemo(() => new Map(pins.map((pin) => [pin.key, pin])), [pins]);
  const path = ropePath([{ x: 10, y: STRING_ANCHOR_Y }, ...pins, { x: width - 10, y: STRING_ANCHOR_Y }]);

  const updateEdges = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setEdges({ start: scroller.scrollLeft < 8, end: scroller.scrollLeft + scroller.clientWidth > scroller.scrollWidth - 8 });
  };

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollLeft = 0;
    updateEdges();
    // A mouse wheel scrolls the board sideways instead of the page, while there is board left to see.
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || scroller.scrollWidth <= scroller.clientWidth) return;
      const atStart = scroller.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 1 && event.deltaY > 0;
      if (atStart || atEnd) return;
      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', updateEdges);
    return () => { scroller.removeEventListener('wheel', onWheel); window.removeEventListener('resize', updateEdges); };
  }, [day, ready, columns.length]);

  const scrollByPage = (direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * scroller.clientWidth * 0.8, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  // Drag the cork with a mouse; touch screens already swipe natively.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !scrollerRef.current) return;
    dragRef.current = { x: event.clientX, left: scrollerRef.current.scrollLeft, moved: false };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const scroller = scrollerRef.current;
    if (!drag || !scroller) return;
    const distance = event.clientX - drag.x;
    if (Math.abs(distance) > 5 && !drag.moved) { drag.moved = true; scroller.setPointerCapture(event.pointerId); scroller.classList.add('dragging'); }
    if (drag.moved) scroller.scrollLeft = drag.left - distance;
  };
  const endDrag = () => {
    suppressClickRef.current = Boolean(dragRef.current?.moved);
    dragRef.current = null;
    scrollerRef.current?.classList.remove('dragging');
  };

  const photoCount = columns.filter((column) => column.photo).length;
  const noteCount = columns.reduce((total, column) => total + column.notes.length, 0);

  return <section className="board-view" aria-labelledby="board-title">
    <header className="board-toolbar">
      <button className="icon-button" type="button" title="Quay lại Kỷ niệm" aria-label="Quay lại Kỷ niệm" onClick={onBack}><ChevronLeft size={18} /></button>
      <div className="board-title"><h2 id="board-title">{formatDay(day)}</h2><p>{!ready ? 'Đang ghim lên bảng…' : columns.length === 0 ? 'Chưa có gì được ghim' : `${photoCount} tấm ảnh và ${noteCount} mẩu giấy`}</p></div>
      <button className="button button-soft board-chat-button" type="button" onClick={onOpenChat}><MessageCircle size={15} /> Trò chuyện</button>
    </header>

    <div className="board-frame">
      <div
        ref={scrollerRef}
        className="board-cork"
        tabIndex={0}
        role="region"
        aria-label="Ảnh và lời nhắn trong ngày, trượt ngang để xem thêm"
        onScroll={updateEdges}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(event) => { if (suppressClickRef.current) { event.stopPropagation(); event.preventDefault(); suppressClickRef.current = false; } }}
      >
        {!ready ? <div className="board-empty"><span className="board-note note-white"><span className="board-tape" aria-hidden="true" />Đang ghim ảnh lên bảng…</span></div>
          : columns.length === 0 ? <div className="board-empty"><span className="board-note note-pink"><span className="board-pin" aria-hidden="true" />Ngày này còn trống.<small>Mở cuộc trò chuyện để kể một điều, nó sẽ được ghim ở đây.</small></span></div>
          : <div className="board-track" style={{ width }}>
            <svg className="board-string" width={width} height="260" viewBox={`0 0 ${width} 260`} aria-hidden="true">
              <path d={path} className="rope-shadow" />
              <path d={path} className="rope-edge" />
              <path d={path} className="rope-core" />
              <path d={path} className="rope-twist" />
              <circle className="rope-nail" cx="10" cy={STRING_ANCHOR_Y} r="5" />
              <circle className="rope-nail" cx={width - 10} cy={STRING_ANCHOR_Y} r="5" />
            </svg>
            {columns.map((column, index) => {
              const pin = pinByKey.get(column.key);
              const tilt = (seeded(column.key, 7) - 0.5) * 16;
              return <div className="board-column" key={column.key} style={{ width: SLOT }}>
                <div className="board-hanger">
                  {column.photo && pin && <figure className="board-photo" style={{ top: pin.y, transform: `rotate(${tilt.toFixed(1)}deg)`, animationDelay: `${Math.min(index, 12) * 60}ms` }}>
                    <span className="board-clip" aria-hidden="true" />
                    {column.photo.isVideo
                      ? <video src={column.photo.url} muted playsInline loop preload="metadata" controls aria-label={`Video của ${authorLabel(column.photo.author)}`} />
                      : <button type="button" className="board-photo-open" aria-label={`Mở ảnh của ${authorLabel(column.photo.author)} lúc ${column.photo.time}`} onClick={() => onViewPhoto({ url: column.photo!.url, alt: `Ảnh của ${authorLabel(column.photo!.author)}` })}><img src={column.photo.url} alt="" loading="lazy" draggable={false} /></button>}
                    <figcaption>{authorLabel(column.photo.author)}, {column.photo.time}</figcaption>
                  </figure>}
                </div>
                <div className="board-notes">
                  {column.notes.map((note, noteIndex) => {
                    const color = note.kind === 'anniversary' ? 'note-pink' : note.kind === 'comment' ? 'note-butter' : NOTE_COLORS[Math.floor(seeded(note.id, 3) * NOTE_COLORS.length)];
                    const rotate = (seeded(note.id, 11) - 0.5) * 7;
                    const fastener = noteIndex % 2 === 0 ? <span className="board-tape" aria-hidden="true" /> : <span className="board-pin" aria-hidden="true" />;
                    return <article className={`board-note ${color} ${note.kind === 'comment' ? 'board-note-small' : ''}`} key={note.id} style={{ transform: `rotate(${rotate.toFixed(1)}deg)` }}>
                      {fastener}
                      {note.kind === 'anniversary' ? <p className="board-note-title"><CalendarDays size={13} /> {note.text}</p> : <p>{note.text}</p>}
                      {note.author && <footer>{authorLabel(note.author)}, {note.time} <span aria-hidden="true">{note.author.chatIcon || '💗'}</span></footer>}
                    </article>;
                  })}
                </div>
              </div>;
            })}
          </div>}
      </div>
      {!edges.start && <button className="board-scroll board-scroll-start" type="button" aria-label="Xem phần trước" onClick={() => scrollByPage(-1)}><ChevronLeft size={18} /></button>}
      {!edges.end && <button className="board-scroll board-scroll-end" type="button" aria-label="Xem tiếp" onClick={() => scrollByPage(1)}><ChevronRight size={18} /></button>}
    </div>
  </section>;
}
