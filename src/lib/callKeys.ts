import { CallRecord } from '../types/dashboard';
import { durationToSeconds } from './analytics';

/**
 * Ultatel Call IDs look like "1791808392.14495": the number before the dot is the call's start time in Unix
 * seconds. That gives every call an exact, timezone-proof timestamp.
 *
 * Important: one Call ID can legitimately appear on SEVERAL rows (ring attempts / call legs, each with its own
 * time, duration and outcome). Ultatel counts every row, so this app does too. Only extra *copies* of a row
 * (the same export imported twice, with a different clock or ID precision) are removed.
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

const SOURCE_CLOCK_OFFSET_MS = 6 * 3600 * 1000; // Ultatel exports use a fixed UTC-6 clock
const WINDOW_BEFORE_MS = 90_000;                // raw copies lost their seconds, so they can start a bit "early"
const WINDOW_AFTER_MS = 6 * 3600 * 1000;        // a later leg of the same call

/** Reads "YYYY-MM-DD HH:mm[:ss]" or "MM-DD-YYYY HH:mm[:ss]" as if the clock fields were UTC. */
function naiveMs(text: string): number | null {
  const s = String(text ?? '').trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  let y: number, mo: number, d: number;
  if (m) {
    y = +m[1]; mo = +m[2]; d = +m[3];
  } else {
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    mo = +m[1]; d = +m[2]; y = +m[3];
    if (mo > 12 && d <= 12) [mo, d] = [d, mo];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return Date.UTC(y, mo - 1, d, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

function formatNaive(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

type Clock = 'cairo' | 'source' | 'unknown';

/** Tells which clock a written call time is on, by comparing it with the time inside the Call ID. */
function classifyClock(dateText: string, epoch: number): Clock {
  const naive = naiveMs(dateText);
  if (naive === null) return 'unknown';
  const cairoOffset = (naiveMs(cairoDateTime(epoch)) as number) - epoch * 1000;
  const asCairo = naive - cairoOffset - epoch * 1000;
  if (asCairo >= -WINDOW_BEFORE_MS && asCairo <= WINDOW_AFTER_MS) return 'cairo';
  const asSource = naive + SOURCE_CLOCK_OFFSET_MS - epoch * 1000;
  if (asSource >= -WINDOW_BEFORE_MS && asSource <= WINDOW_AFTER_MS) return 'source';
  return 'unknown';
}

/** Cairo time of a call row: kept if already Cairo, converted if on the export clock, else taken from the ID. */
export function exactCairoTime(callDate: string, callId: unknown): string {
  const epoch = callEpoch(callId);
  if (epoch === null) return callDate;
  const clock = classifyClock(callDate, epoch);
  const naive = naiveMs(callDate);
  const fromId = cairoDateTime(epoch);
  let written: string | null = null;
  if (clock === 'cairo' && naive !== null) written = formatNaive(naive);
  else if (clock === 'source' && naive !== null) written = cairoDateTime((naive + SOURCE_CLOCK_OFFSET_MS) / 1000);
  if (written === null) return fromId;
  // A time whose seconds were rounded away (":00") within the same minute as the ID's time: use the exact one.
  if (written.endsWith(':00') && written.slice(0, 16) === fromId.slice(0, 16)) return fromId;
  return written;
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/**
 * ID part of the row identity. For Ultatel IDs this is the timestamp only: the sequence after the dot is
 * sometimes lost or reformatted when the sheet stores it as a number ("…14500" becomes "…145"), and two
 * different calls from the same extension to the same number in the same second do not occur.
 */
function normId(callId: unknown): string {
  const epoch = callEpoch(callId);
  return epoch !== null ? String(epoch) : String(callId ?? '').trim().toLowerCase();
}

/** Everything except the clock: two copies of the same export row share this. */
export function callRowKey(c: Pick<CallRecord, 'callId' | 'from' | 'to' | 'extension' | 'type' | 'outcome' | 'duration' | 'callDate'>): string {
  const id = normId(c.callId);
  const base = [norm(c.from), norm(c.to), norm(c.extension), norm(c.type), norm(c.outcome), durationToSeconds(c.duration)].join('|');
  // Without an ID there is nothing to match copies on, so the written time is part of the identity.
  return id ? `${id}|${base}` : `nid|${norm(c.callDate)}|${base}`;
}

/**
 * Counts each call row once and puts every call on exact Cairo time.
 * Rows sharing everything but the clock are copies of the same row only when their clock text differs
 * (a raw copy and a converted copy); identical-looking rows with the SAME text are separate legs and all stay.
 */
export function dedupeAndRedateCalls(calls: CallRecord[]): { calls: CallRecord[]; duplicatesRemoved: number; redated: number } {
  const groups = new Map<string, Map<string, number[]>>();
  calls.forEach((c, i) => {
    const key = callRowKey(c);
    let byText = groups.get(key);
    if (!byText) groups.set(key, (byText = new Map()));
    const text = String(c.callDate ?? '').trim();
    const list = byText.get(text);
    if (list) list.push(i); else byText.set(text, [i]);
  });

  const keep = new Set<number>();
  groups.forEach((byText, key) => {
    let best: number[] | null = null;
    let bestText = '';
    byText.forEach((idxs, text) => {
      const epoch = callEpoch(calls[idxs[0]].callId);
      const isCairo = epoch !== null && classifyClock(text, epoch) === 'cairo';
      const bestIsCairo = best !== null && (() => {
        const e = callEpoch(calls[best![0]].callId);
        return e !== null && classifyClock(bestText, e) === 'cairo';
      })();
      if (!best || idxs.length > best.length || (idxs.length === best.length && isCairo && !bestIsCairo)) {
        best = idxs;
        bestText = text;
      }
    });
    (best as number[] | null)?.forEach((i) => keep.add(i));
    void key;
  });

  let redated = 0;
  const out: CallRecord[] = [];
  calls.forEach((c, i) => {
    if (!keep.has(i)) return;
    const exact = exactCairoTime(String(c.callDate ?? ''), c.callId);
    if (exact !== c.callDate) redated++;
    out.push(exact === c.callDate ? c : { ...c, callDate: exact });
  });
  return { calls: out, duplicatesRemoved: calls.length - out.length, redated };
}
