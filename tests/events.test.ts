import { describe, expect, it } from 'vitest';
import { eventDateFor } from '../src/lib/sheets';
import { computeDashboardMetrics } from '../src/lib/analytics';
import { annotateMeetings } from '../src/lib/meetings';
import type { MeetingRecord } from '../src/types/dashboard';

const mv = (src: string, dst: string, day: string) => ({ src, dst, day });

describe('when a meeting happened', () => {
  it('uses the day it left New Meetings, not later steps', () => {
    const moves = [mv('new meetings', 'follow ups', '2026-10-12'), mv('follow ups', 'invoice sent', '2026-10-14')];
    expect(eventDateFor(moves, 'Invoice Sent')).toBe('2026-10-12');
    expect(eventDateFor(moves, 'Follow Ups')).toBe('2026-10-12');
  });

  it('uses the last time a rescheduled meeting left New Meetings', () => {
    const moves = [mv('new meetings', 'no-show', '2026-10-05'), mv('no-show', 'new meetings', '2026-10-06'), mv('new meetings', 'follow ups', '2026-10-09')];
    expect(eventDateFor(moves, 'Follow Ups')).toBe('2026-10-09');
  });

  it('dates a no-show by the move into No-Show, and ignores other tabs and an empty log', () => {
    expect(eventDateFor([mv('new meetings', 'no-show', '2026-10-12')], 'No-Show')).toBe('2026-10-12');
    expect(eventDateFor([mv('new meetings', 'dead leads', '2026-10-12')], 'Dead Leads')).toBeUndefined();
    expect(eventDateFor(undefined, 'Follow Ups')).toBeUndefined();
  });
});

describe('shows and no-shows count on the day they happened', () => {
  const raw: MeetingRecord[] = [
    { stage: 'Follow Ups', opener: 'Rick', dateAdded: '2026-10-08', eventDate: '2026-10-12', companyName: 'A' },
    { stage: 'No-Show', opener: 'Rick', dateAdded: '2026-10-06', eventDate: '2026-10-13', companyName: 'B' },
    { stage: 'New Meetings', opener: 'Rick', dateAdded: '2026-10-13', companyName: 'C' },
    { stage: 'Follow Ups', opener: 'Rick', dateAdded: '2026-10-02', companyName: 'D' }, // no log: booking date
  ];
  const maps = [{ agent: 'Rick', opener: 'Rick' }];
  const run = (s: string, e: string) => {
    const res = computeDashboardMetrics([], annotateMeetings(raw, new Map()), {}, maps, { startDate: s, endDate: e });
    return { rick: res.openers.find((o) => o.opener === 'Rick')!, res };
  };

  it('the week of the move gets the show and the no-show, the booking week gets the booking', () => {
    const wk = run('2026-10-12', '2026-10-18');
    expect(wk.rick.booked).toBe(1); // only C was booked this week
    expect(wk.rick.noShow).toBe(1);
    expect(wk.rick.awaitingConfirmation).toBe(1); // A happened on the 12th
    const before = run('2026-10-05', '2026-10-11');
    expect(before.rick.booked).toBe(2); // A and B were booked then
    expect(before.rick.noShow).toBe(0);
    expect(before.rick.awaitingConfirmation).toBe(0);
    const old = run('2026-10-01', '2026-10-04');
    expect(old.rick.awaitingConfirmation).toBe(1); // D has no log entry
  });

  it('lists meetings booked or held in the range', () => {
    const { res } = run('2026-10-12', '2026-10-18');
    expect(res.filteredMeetings.map((m) => m.companyName).sort()).toEqual(['A', 'B', 'C']);
  });
});
