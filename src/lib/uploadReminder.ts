/**
 * Which working day's Ultatel export is still missing? Calls are expected to be uploaded each morning for the
 * day before. Weekends are skipped (Friday's export is due on Monday), so a quiet weekend never raises a reminder.
 */
function localDate(now: Date, zone: string): string {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).forEach((x) => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}

/** The most recent Monday-Friday before today (in `zone`), as YYYY-MM-DD. */
export function lastDueWorkday(now: Date, zone: string): string {
  const [y, m, d] = localDate(now, zone).split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  do {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  } while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
  return cursor.toISOString().slice(0, 10);
}

/** The day to ask for, or null when the newest call in the sheet is already on or after the last due workday. */
export function missingUploadDay(latestCallDate: string | null | undefined, now: Date, zone: string): string | null {
  if (!latestCallDate) return null;
  const due = lastDueWorkday(now, zone);
  return latestCallDate < due ? due : null;
}
