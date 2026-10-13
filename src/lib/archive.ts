// Monthly call-log archive tabs ("Call Logs 2026-09"): which months a date range needs.

export const ARCHIVE_PREFIX = 'Call Logs ';
const ARCHIVE_TAB_RE = /^Call Logs (\d{4})-(\d{2})$/;

export function archiveTabName(monthKey: string): string {
  return `${ARCHIVE_PREFIX}${monthKey}`;
}

/** "2026-09" for archive tab titles; null for any other tab (including "Call Logs backup ..."). */
export function archiveMonthOfTitle(title: string): string | null {
  const m = title.match(ARCHIVE_TAB_RE);
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}` : null;
}

function parseISO(date: string | undefined): number | null {
  const m = (date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

/**
 * Month keys a date range touches, widened by 2 days each side so calls near a month edge are found whichever
 * clock decided their month. Needs both dates; an open-ended range reads only the active log. Capped at 36 months.
 */
export function monthKeysForRange(startDate?: string, endDate?: string): string[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (start === null || end === null || end < start) return [];
  const from = new Date(start - 2 * 86400000);
  const to = new Date(end + 2 * 86400000);
  const keys: string[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  while ((y < to.getUTCFullYear() || (y === to.getUTCFullYear() && m <= to.getUTCMonth())) && keys.length < 36) {
    keys.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    if (++m > 11) { m = 0; y++; }
  }
  return keys;
}
