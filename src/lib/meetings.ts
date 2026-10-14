import { CONFIRMATION_QUEUE_STAGE, CONFIRMATION_START_DATE, LIKELY_SHOW_STAGES } from './stages';
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

/** Added before the confirmation start date (or undated old rows): counted by the tab it sits in. */
export function isLegacyMeeting(m: MeetingRecord): boolean {
  return !m.dateAdded || m.dateAdded < CONFIRMATION_START_DATE;
}

/**
 * A show is:
 * - an old meeting (Date Added before the start date) in a show tab (Follow Ups, Contract Sent, Invoice Sent,
 *   Onboarded, Temporary Inactive), no confirmation needed; or
 * - a newer meeting that management confirmed in the dashboard (wherever its row sits now, except No-Show).
 * No-Show never counts, and neither does an unconfirmed new meeting, whatever tab it moves to.
 */
export function isConfirmedShow(m: MeetingRecord): boolean {
  if (m.stage === 'No-Show') return false;
  if (isLegacyMeeting(m)) return LIKELY_SHOW_STAGES.includes(m.stage);
  return m.showConfirmed === true;
}

/** A new meeting that reached Follow Ups and is waiting for management to confirm it. */
export function isAwaitingConfirmation(m: MeetingRecord): boolean {
  return !isLegacyMeeting(m) && m.showConfirmed !== true && m.stage === CONFIRMATION_QUEUE_STAGE;
}

/** A new meeting that skipped Follow Ups (moved straight to a later show tab) and was never confirmed. */
export function isSkippedConfirmation(m: MeetingRecord): boolean {
  return !isLegacyMeeting(m) && m.showConfirmed !== true && m.stage !== CONFIRMATION_QUEUE_STAGE && LIKELY_SHOW_STAGES.includes(m.stage);
}

/** May management confirm this row? Only new meetings in a show tab (Follow Ups, or later tabs they skipped to). */
export function canBeConfirmed(m: MeetingRecord): boolean {
  return !isLegacyMeeting(m) && LIKELY_SHOW_STAGES.includes(m.stage);
}
