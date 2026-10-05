'use client';

import { CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StreakStatus } from '@chuyen/contracts';
import { formatMonth, prefersReducedMotion, useModal } from './shared';

const HEART_PATH = 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';
const WATER_BACK = 'M-24 0 Q-18 -1.5 -12 0 T0 0 T12 0 T24 0 T36 0 T48 0 V26 H-24Z';
const WATER_FRONT = 'M-24 0.3 Q-18 1.8 -12 0.3 T0 0.3 T12 0.3 T24 0.3 T36 0.3 T48 0.3 V26 H-24Z';

function waterlineFor(progress: number) {
  // The pointed tip hides very small fills behind the outline at icon size.
  const visible = progress > 0 ? Math.max(progress, 10) : 0;
  return visible <= 50 ? 21 - 10 * Math.sqrt(visible / 50) : 11 - 9 * (visible - 50) / 50;
}

function Water({ progress }: { progress: number }) {
  if (progress <= 0) return null;
  if (progress >= 100) return <path d={HEART_PATH} fill="#db2777" />;
  const waterline = waterlineFor(progress);
  return <>
    <rect x="0" y={waterline + 0.7} width="24" height="24" fill="#db2777" />
    <g transform={`translate(0 ${waterline})`}>
      <path className="heart-water-back" d={WATER_BACK} />
      <path className="heart-water-front" d={WATER_FRONT} />
    </g>
  </>;
}

export function StreakHeart({ progress }: { progress: number }) {
  const clipId = useId();
  return <svg className="streak-heart" viewBox="0 0 24 24" aria-hidden="true">
    <defs><clipPath id={clipId}><path d={HEART_PATH} /></clipPath></defs>
    <path d={HEART_PATH} fill="#fff0f6" />
    <g clipPath={`url(#${clipId})`}><Water progress={progress} /></g>
    <path d={HEART_PATH} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>;
}

/** Counts from 0 up to `target` once, easing out, so the number lands with the heart. */
function useCountUp(target: number, delayMs: number) {
  const [value, setValue] = useState(() => prefersReducedMotion() ? target : 0);
  useEffect(() => {
    if (prefersReducedMotion() || target <= 0) { setValue(target); return; }
    let frame = 0;
    const duration = Math.min(1100, 380 + target * 28);
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, delayMs]);
  return value;
}

/**
 * The nav heart grows out of its spot into the middle of the screen and shows this month's
 * streak days. The number is drawn twice: rose on the empty part, white where the water is,
 * so it stays readable at any fill level and the waterline visibly cuts through it.
 */
export function StreakHeartBurst({ streak, progress, origin, onClose }: { streak: StreakStatus | null; progress: number; origin: DOMRect | null; onClose: () => void }) {
  const { panelRef, closing, close } = useModal(onClose);
  const heartRef = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<CSSProperties>({});
  const ids = useId();
  const clipId = `${ids}-clip`;
  const maskId = `${ids}-mask`;
  const days = streak?.monthStreakDays ?? 0;
  const target = streak?.target ?? 30;
  const shown = useCountUp(days, 260);
  const waterline = waterlineFor(progress);
  const month = streak?.month ? formatMonth(streak.month) : 'tháng này';
  const shortMonth = streak?.month ? `tháng ${Number(streak.month.split('-')[1])}` : 'tháng này';

  // Start the big heart exactly on top of the small one so it reads as the same heart growing.
  useLayoutEffect(() => {
    const heart = heartRef.current;
    if (!heart || !origin) return;
    const box = heart.getBoundingClientRect();
    setFlight({
      '--from-x': `${origin.left + origin.width / 2 - (box.left + box.width / 2)}px`,
      '--from-y': `${origin.top + origin.height / 2 - (box.top + box.height / 2)}px`,
      '--from-scale': `${Math.max(0.08, origin.width / box.width)}`,
    } as CSSProperties);
  }, [origin]);

  const numberSize = shown >= 10 ? 7.4 : 8.6;
  const number = <text x="12" y="12.6" textAnchor="middle" dominantBaseline="middle" fontSize={numberSize}>{shown}</text>;

  // Portal to <body>: the sticky header's backdrop-filter would otherwise trap position: fixed.
  return createPortal(<div
    className={`heart-burst ${closing ? 'closing' : ''}`}
    ref={(element) => { panelRef.current = element; }}
    role="dialog"
    aria-modal="true"
    aria-label={`Trái tim ${month}: ${days} trên ${target} ngày giữ streak`}
    tabIndex={-1}
    onClick={close}
  >
    <div className="heart-burst-stage">
      <div className="heart-burst-heart" ref={heartRef} style={flight}>
        <span className="heart-burst-glow" aria-hidden="true" />
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <clipPath id={clipId}><path d={HEART_PATH} /></clipPath>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
              <g fill="#fff"><Water progress={progress} /></g>
            </mask>
          </defs>
          <path d={HEART_PATH} fill="#fff0f6" />
          <g clipPath={`url(#${clipId})`}><Water progress={progress} /></g>
          <g className="heart-burst-number">
            <g fill="#be185d">{number}</g>
            {progress > 0 && <g fill="#fff" mask={`url(#${maskId})`} clipPath={`url(#${clipId})`}>{number}</g>}
          </g>
          <path d={HEART_PATH} fill="none" stroke="#d94f91" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="heart-burst-caption" aria-live="polite">
        <p className="heart-burst-title">{days === 0 ? 'Trái tim đang chờ hai bạn' : `${days} ngày giữ lửa trong ${shortMonth}`}</p>
        <p className="heart-burst-meta">{days === 0 ? `Trò chuyện hôm nay để rót giọt đầu tiên, mục tiêu ${target} ngày.` : `Còn ${Math.max(0, target - days)} ngày nữa là đầy tim. Đang liên tiếp ${streak?.current ?? 0} ngày, kỷ lục ${streak?.best ?? 0}.`}</p>
      </div>
      <button className="heart-burst-close" type="button" onClick={(event) => { event.stopPropagation(); close(); }}>Đóng</button>
    </div>
  </div>, document.body);
}
