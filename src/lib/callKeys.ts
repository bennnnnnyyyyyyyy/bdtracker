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

/**
 * Time zone that decides which DAY a call belongs to (and the time shown for it in the app).
 * Default "Africa/Cairo" is the clock the sheet stores (our local time, which Ultatel exports now use too),
 * so the written time is used as is. Set CALL_DAY_TIMEZONE=Etc/GMT+6 to count days on Ultatel's old UTC-6 clock.
 */
export function callDayZone(): string {
  return process.env.CALL_DAY_TIMEZONE || 'Africa/Cairo';
}

const zoneFormats = new Map<string, Intl.DateTimeFormat>();
function formatInZone(ms: number, zone: string): string {
  let f = zoneFormats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    zoneFormats.set(zone, f);
  }
  const p: Record<string, string> = {};
  f.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Moves a Cairo-clock call time ("YYYY-MM-DD HH:mm:ss") onto another zone's clock. */
function cairoTextToZone(cairoText: string, epoch: number, zone: string): string {
  if (zone === 'Africa/Cairo') return cairoText;
  const naive = naiveMs(cairoText);
  if (naive === null) return cairoText;
  const cairoOffset = (naiveMs(cairoDateTime(epoch)) as number) - epoch * 1000;
  return formatInZone(naive - cairoOffset, zone);
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/**
 * Phone numbers are compared by their last 10 digits, so "+16156173189", "16156173189" and "6156173189"
 * (and lists such as "6155227411, 6155227411") are the same number whichever way the sheet shows them.
 */
function normPhone(v: unknown): string {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
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
  const base = [normPhone(c.from), normPhone(c.to), norm(c.extension), norm(c.type), norm(c.outcome), durationToSeconds(c.duration)].join('|');
  // Without an ID there is nothing to match copies on, so the written time is part of the identity.
  return id ? `${id}|${base}` : `nid|${norm(c.callDate)}|${base}`;
}

/** Everything written in the sheet row. Copies of a row differ somewhere in it (a "+", a clock, a seconds column). */
function signature(c: CallRecord): string {
  if (c.rowSignature) return c.rowSignature;
  return JSON.stringify([c.callDate, c.callId, c.from, c.to, c.extension, c.type, c.outcome, c.duration, c.notes, c.callPath].map((v) => String(v ?? '').trim()));
}

/**
 * Counts each call row once and puts every call on exact Cairo time.
 * Rows describing the same call are copies of each other only when what is written in the sheet differs
 * (a raw clock vs a Cairo clock, "+1555..." vs "1555...", a different seconds column). Rows that are written
 * identically are separate legs of the call and all stay.
 */
export function dedupeAndRedateCalls(calls: CallRecord[]): { calls: CallRecord[]; duplicatesRemoved: number; redated: number } {
  const groups = new Map<string, Map<string, number[]>>();
  calls.forEach((c, i) => {
    const key = callRowKey(c);
    let byText = groups.get(key);
    if (!byText) groups.set(key, (byText = new Map()));
    const text = signature(c);
    const list = byText.get(text);
    if (list) list.push(i); else byText.set(text, [i]);
  });

  const keep = new Set<number>();
  groups.forEach((byText, key) => {
    let best: number[] | null = null;
    const isCairoRow = (i: number) => {
      const e = callEpoch(calls[i].callId);
      return e !== null && classifyClock(String(calls[i].callDate ?? ''), e) === 'cairo';
    };
    byText.forEach((idxs) => {
      const isCairo = isCairoRow(idxs[0]);
      const bestIsCairo = best !== null && isCairoRow(best[0]);
      if (!best || idxs.length > best.length || (idxs.length === best.length && isCairo && !bestIsCairo)) {
        best = idxs;
      }
    });
    (best as number[] | null)?.forEach((i) => keep.add(i));
    void key;
  });

  const zone = callDayZone();
  let redated = 0;
  const out: CallRecord[] = [];
  calls.forEach((c, i) => {
    if (!keep.has(i)) return;
    const epoch = callEpoch(c.callId);
    const cairo = exactCairoTime(String(c.callDate ?? ''), c.callId);
    const exact = epoch !== null ? cairoTextToZone(cairo, epoch, zone) : cairo;
    if (exact !== c.callDate) redated++;
    out.push(exact === c.callDate ? c : { ...c, callDate: exact });
  });
  return { calls: out, duplicatesRemoved: calls.length - out.length, redated };
}
