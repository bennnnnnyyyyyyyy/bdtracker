import { CONFIRMATION_START_DATE, LEGACY_SHOW_STAGES, STAGE_RANK } from './stages';
import { MeetingRecord } from '../types/dashboard';

export interface ConfirmationInfo {
  confirmedBy: string;
  confirmedAt: string;
}

function part(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Gives every tracker row a stable key: opener | date added | company | contact.
 * The stage is deliberately NOT part of the key, because moving a lead between stages
 * means moving its row to another tab. Identical rows get a "#2", "#3" suffix in order.
 */
export function buildMeetingKeys(meetings: MeetingRecord[]): string[] {
  const seen = new Map<string, number>();
  return meetings.map((m) => {
    const base = [part(m.opener), part(m.dateAdded), part(m.companyName), part(m.authorizedPerson)].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

/** Returns copies of the meetings with their key and confirmation state attached. */
export function annotateMeetings(
  meetings: MeetingRecord[],
  confirmations: Map<string, ConfirmationInfo>
): MeetingRecord[] {
  const keys = buildMeetingKeys(meetings);
  return meetings.map((m, i) => {
    const info = confirmations.get(keys[i]);
    return {
      ...m,
      meetingKey: keys[i],
      showConfirmed: Boolean(info),
      confirmedBy: info?.confirmedBy,
      confirmedAt: info?.confirmedAt,
    };
  });
}

/** A row that sits in a pipeline tab but whose Status says "No Show" is a no-show, whatever tab it was moved to. */
export function effectiveStage(stage: string, status: unknown): string {
  return /^no[\s_-]*show/i.test(String(status ?? '').trim()) ? 'No-Show' : stage;
}

/**
 * Keys of stored records (confirmations, reschedule markers) whose tracker row was edited since they were saved.
 * A stored key that no longer matches any row is paired with the one current row that differs from it in a single
 * field (opener, date added, company or contact) while the other three are filled in and identical.
 * Returns current key -> stored key, only for unambiguous one-to-one pairs.
 */
export function findEditedKeys(currentKeys: string[], storedKeys: Iterable<string>): Map<string, string> {
  const current = new Set(currentKeys);
  const orphans = Array.from(new Set(Array.from(storedKeys).filter((k) => !current.has(k))));
  const fields = (k: string): string[] | null => {
    const f = k.replace(/#\d+$/, '').split('|');
    return f.length === 4 ? f : null;
  };
  const stored = orphans.map((k) => ({ key: k, f: fields(k) })).filter((o): o is { key: string; f: string[] } => o.f !== null);
  const candidates = new Map<string, string[]>();
  const claimed = new Map<string, number>();
  currentKeys.forEach((ck) => {
    const cf = fields(ck);
    if (!cf) return;
    const hits = stored.filter((o) => {
      const same = cf.filter((v, i) => v !== '' && v === o.f[i]).length;
      return same === 3 && cf.filter((v, i) => v !== o.f[i]).length === 1;
    }).map((o) => o.key);
    if (hits.length === 1) {
      candidates.set(ck, hits);
      claimed.set(hits[0], (claimed.get(hits[0]) ?? 0) + 1);
    }
  });
  const out = new Map<string, string>();
  candidates.forEach(([old], ck) => { if (claimed.get(old) === 1) out.set(ck, old); });
  return out;
}

/** A "Rescheduled" meeting is not counted as a meeting (or a show) until it is held and its status changes. */
export function isRescheduledStatus(status: unknown): boolean {
  return /^rescheduled/i.test(String(status ?? '').trim());
}

/**
 * Counted by the tab it sits in, without confirmation: added before the confirmation start date (or undated old
 * rows), and not a meeting that was rescheduled (those follow the confirmation rules).
 */
export function isLegacyMeeting(m: MeetingRecord): boolean {
  if (m.rescheduled) return false;
  return !m.dateAdded || m.dateAdded < CONFIRMATION_START_DATE;
}

/**
 * A show is:
 * - an old meeting in a show tab (Follow Ups, Contract Sent, Invoice Sent, Onboarded, Temporary Inactive) or Dead
 *   Leads, no confirmation needed; or
 * - any other meeting (added from the start date, or rescheduled) once management confirmed it, wherever its row
 *   sits now except No-Show.
 * No-Show never counts, and neither does an unconfirmed new meeting, whatever tab it moves to.
 */
export function isConfirmedShow(m: MeetingRecord): boolean {
  if (m.stage === 'No-Show') return false;
  if (isLegacyMeeting(m)) return LEGACY_SHOW_STAGES.includes(m.stage);
  return m.showConfirmed === true;
}

/** The confirmation queue: a new meeting that moved from New Meetings to any other tab except No-Show and is not confirmed yet. */
export function isAwaitingConfirmation(m: MeetingRecord): boolean {
  return !isLegacyMeeting(m) && m.showConfirmed !== true && m.stage !== 'New Meetings' && m.stage !== 'No-Show';
}

/** May management confirm this row? New meetings (or rescheduled ones) in any tab except New Meetings and No-Show. */
export function canBeConfirmed(m: MeetingRecord): boolean {
  return !isLegacyMeeting(m) && m.stage !== 'New Meetings' && m.stage !== 'No-Show';
}

/** Confirmed as a show, but the row is back in New Meetings: management should decide if it became a no-show. */
export function needsReview(m: MeetingRecord): boolean {
  return m.showConfirmed === true && (m.stage === 'New Meetings' || isRescheduledStatus(m.status));
}

/**
 * Drops repeated rows of the same meeting. Rows are the same meeting only when opener, Date Added, company and
 * contact all match (a different date is a different meeting). Rows without a date or company are never merged.
 * When the same meeting sits in two tabs the furthest-along tab is kept.
 */
export function dedupeMeetings(meetings: MeetingRecord[]): MeetingRecord[] {
  const best = new Map<string, MeetingRecord>();
  const out: (MeetingRecord | string)[] = [];
  meetings.forEach((m) => {
    if (!m.dateAdded || !part(m.companyName)) { out.push(m); return; }
    const key = [part(m.opener), part(m.dateAdded), part(m.companyName), part(m.authorizedPerson)].join('|');
    const kept = best.get(key);
    if (!kept) { best.set(key, m); out.push(key); return; }
    if ((STAGE_RANK[m.stage] ?? -1) > (STAGE_RANK[kept.stage] ?? -1)) best.set(key, m);
  });
  return out.map((x) => (typeof x === 'string' ? (best.get(x) as MeetingRecord) : x));
}
