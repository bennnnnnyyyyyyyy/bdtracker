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
