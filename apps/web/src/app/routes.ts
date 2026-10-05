export type Page = 'home' | 'day' | 'board' | 'calendar' | 'profile';
export type AppRoute = { page: Page; day?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: string | undefined): value is string {
  if (!value || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * URL scheme for the tabs:
 *   /                    → Hôm nay (today's chat)
 *   /day/YYYY-MM-DD      → chat of a past day
 *   /memories            → Kỷ niệm calendar
 *   /memories/YYYY-MM-DD → memory board of one day
 *   /profile             → profile & settings
 * Returns null for anything else. next.config.ts rewrites these paths to the app page.
 */
export function routeFromSegments(segments: readonly string[] = []): AppRoute | null {
  const [first, second, ...rest] = segments.map((segment) => decodeURIComponent(segment));
  if (rest.length) return null;
  if (first === undefined) return { page: 'home' };
  if (first === 'profile' && second === undefined) return { page: 'profile' };
  if (first === 'memories') {
    if (second === undefined) return { page: 'calendar' };
    return isDate(second) ? { page: 'board', day: second } : null;
  }
  if (first === 'day' && isDate(second)) return { page: 'day', day: second };
  return null;
}

export function routeFromPath(pathname: string): AppRoute | null {
  return routeFromSegments(pathname.split('/').filter(Boolean));
}

export function pathForRoute({ page, day }: AppRoute): string {
  switch (page) {
    case 'home': return '/';
    case 'profile': return '/profile';
    case 'calendar': return '/memories';
    case 'board': return day ? `/memories/${day}` : '/memories';
    case 'day': return day ? `/day/${day}` : '/';
  }
}
