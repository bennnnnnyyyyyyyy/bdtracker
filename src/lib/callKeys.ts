import { CallRecord } from '../types/dashboard';

/**
 * Ultatel call IDs look like "1791808392.170981": the part before the dot is the call's start time
 * in Unix seconds. That gives every call an exact, timezone-proof timestamp and a duplicate-proof identity,
 * even when the sheet copy of the call has a truncated ID or a wrong/rounded clock.
 */
export function callEpoch(callId: unknown): number | null {
  const m = String(callId ?? '').trim().match(/^(\d{9,10})(?:\.\d+)?$/);
  if (!m) return null;
  const epoch = Number(m[1]);
  return epoch >= 1_400_000_000 && epoch <= 4_100_000_000 ? epoch : null;
}

const cairoFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** "YYYY-MM-DD HH:mm:ss" in Cairo time (DST aware) for a Unix timestamp in seconds. */
export function cairoDateTime(epochSeconds: number): string {
  const p: Record<string, string> = {};
  cairoFormat.formatToParts(new Date(epochSeconds * 1000)).forEach((x) => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/** Identity of a call: the same call copied twice (even with a different clock or ID precision) has the same key. */
export function callKey(c: Pick<CallRecord, 'callId' | 'from' | 'to' | 'extension' | 'callDate' | 'duration'>): string {
  const epoch = callEpoch(c.callId);
  if (epoch !== null) return `e|${epoch}|${norm(c.from)}|${norm(c.to)}|${norm(c.extension)}`;
  const id = norm(c.callId);
  if (id) return `i|${id}`;
  return `c|${norm(c.callDate)}|${norm(c.from)}|${norm(c.to)}|${norm(c.duration)}|${norm(c.extension)}`;
}

/**
 * Removes duplicate copies of the same call and dates every call from its ID's timestamp (Cairo time).
 * Calls without a usable ID keep the date written in the sheet.
 */
export function dedupeAndRedateCalls(calls: CallRecord[]): { calls: CallRecord[]; duplicatesRemoved: number; redated: number } {
  const seen = new Set<string>();
  const out: CallRecord[] = [];
  let redated = 0;
  for (const c of calls) {
    const key = callKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    const epoch = callEpoch(c.callId);
    if (epoch !== null) {
      const cairo = cairoDateTime(epoch);
      if (cairo !== c.callDate) redated++;
      out.push({ ...c, callDate: cairo });
    } else {
      out.push(c);
    }
  }
  return { calls: out, duplicatesRemoved: calls.length - out.length, redated };
}
