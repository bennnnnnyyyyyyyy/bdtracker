import { CONFIG } from './config';
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

/** A show = management confirmed it, and it is not sitting in No-Show / Dead Leads. */
export function isConfirmedShow(m: MeetingRecord): boolean {
  return m.showConfirmed === true && !CONFIG.NEVER_SHOW_STAGES.includes(m.stage);
}

/** Unconfirmed meeting in a stage where it most likely happened. */
export function isAwaitingConfirmation(m: MeetingRecord): boolean {
  return m.showConfirmed !== true && CONFIG.LIKELY_SHOW_STAGES.includes(m.stage);
}
