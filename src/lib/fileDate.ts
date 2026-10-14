// Pure helper (safe for the browser bundle): the report day written in a file name.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * The report day written in a file name: "…_JULY_1.xlsx", "Jul-01", "2026-07-01", "07-01-2026" or "07_01".
 * Without a year, the most recent such day that is not in the future is used.
 */
export function dateFromFileName(filename: string, today: Date = new Date()): string | null {
  const base = filename.replace(/\.[a-z0-9]+$/i, '');
  const iso = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  };
  const withYear = (m: number, d: number) => {
    const y = today.getUTCFullYear();
    const thisYear = iso(y, m, d);
    return thisYear && thisYear <= today.toISOString().slice(0, 10) ? thisYear : iso(y - 1, m, d);
  };

  let m = base.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = base.match(/(?<!\d)(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})/);
  if (m) return iso(+m[3], +m[1], +m[2]); // US order, as in Ultatel's own file names
  m = base.match(/([a-z]{3,9})[\s_.-]*(\d{1,2})(?!\d)/i);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (month >= 0) return withYear(month + 1, +m[2]);
  }
  m = base.match(/(?<!\d)(\d{1,2})[-_.](\d{1,2})(?![\d-])/);
  if (m) return withYear(+m[1], +m[2]);
  return null;
}

