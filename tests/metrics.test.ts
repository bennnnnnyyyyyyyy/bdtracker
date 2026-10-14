import { describe, expect, it } from 'vitest';
import { computeDashboardMetrics, resolveOpener } from '../src/lib/analytics';
import { annotateMeetings, canBeConfirmed, isConfirmedShow, isSkippedConfirmation } from '../src/lib/meetings';
import { calculateAgentPresentDays, getAttendanceWeight, parseAttendanceRows } from '../src/lib/attendance';
import type { AgentMapping, CallRecord, MeetingRecord } from '../src/types/dashboard';

const mappings: AgentMapping[] = [
  { agent: 'Ben Arthur', opener: 'Ben' },
  { agent: 'Kaity James', opener: 'Jane' },
];

function call(over: Partial<CallRecord>): CallRecord {
  return {
    callDate: '2026-08-10 09:00:00', callId: String(Math.random()), from: '1', to: '2', extension: '112 (MMS-Ben Arthur)',
    department: 'BD', did: '', description: '', type: 'OUT-Bound', outcome: 'ANSWERED', duration: '0:30', durationSec: 30,
    notes: '', callPath: '', agent: 'Ben Arthur', opener: '', ...over,
  };
}
const meeting = (stage: string, opener: string, dateAdded: string, extra: Partial<MeetingRecord> = {}): MeetingRecord => ({ stage, opener, dateAdded, ...extra });

describe('ignored agents', () => {
  it('hides an agent whose Opener is "ignore" from every number', () => {
    const maps: AgentMapping[] = [...mappings, { agent: 'Eric Dean', opener: 'ignore' }];
    expect(resolveOpener('Eric Dean', maps)).toBeNull();
    expect(resolveOpener('Eric', maps)).toBeNull();
    const res = computeDashboardMetrics([call({ agent: 'Eric Dean', extension: '120 (MMS-Eric Dean)' }), call({})], [], {}, maps, { startDate: '2026-08-10', endDate: '2026-08-10' });
    expect(res.openers.map((o) => o.opener)).not.toContain('ignore');
    expect(res.openers.map((o) => o.opener)).not.toContain('Eric Dean');
  });
});

describe('resolveOpener', () => {
  it('maps PBX names, first names and rejects system channels', () => {
    expect(resolveOpener('Ben Arthur', mappings)).toBe('Ben');
    expect(resolveOpener('Kaity James', mappings)).toBe('Jane');
    expect(resolveOpener('Kaity', mappings)).toBe('Jane');
    expect(resolveOpener('Benjamin Lee', mappings)).toBe('Benjamin Lee'); // not "Ben"
    expect(resolveOpener('101', mappings)).toBeNull();
    expect(resolveOpener('Front Desk', mappings)).toBeNull();
    expect(resolveOpener('George Smith', mappings)).toBeNull();
  });
});

describe('attendance', () => {
  it('weights codes', () => {
    expect(['P', 'L1', 'L2', 'Q', 'H', 'X', ''].map(getAttendanceWeight)).toEqual([1, 1, 1, 0.75, 0.5, 0, 0]);
  });

  const rows = [
    ['Date', '2026-08-10', '2026-08-11', '2026-08-12'],
    ['Ben (Part-time)', 'P', 'H', ''],
    ['Benjamin Lee', 'P', 'P', 'P'],
  ];

  it('parses blocks and sums weights inside the range', () => {
    const att = parseAttendanceRows(rows);
    expect(calculateAgentPresentDays('Ben', att, mappings, '2026-08-10', '2026-08-12')).toBe(1.5);
    expect(calculateAgentPresentDays('Ben', att, mappings, '2026-08-11', '2026-08-12')).toBe(0.5);
  });

  it('does not let a later empty cell erase an earlier mark', () => {
    const att = parseAttendanceRows([
      ['Date', '2026-08-10'], ['Ben', 'P'],
      ['Date', '2026-08-10'], ['Ben', ''],
    ]);
    expect(att.agentDaily['Ben']['2026-08-10']).toBe(1);
  });
});

describe('computeDashboardMetrics', () => {
  const calls = [
    call({}), call({}), call({ outcome: 'NO ANSWER', durationSec: 0 }),
    call({ type: 'IN-Bound', durationSec: 60 }),
    call({ extension: '115 (MMS-Kaity James)', agent: 'Kaity James' }),
    call({ extension: '103 (MMS-George)', agent: 'George' }),          // excluded
    call({ callDate: '2026-07-01 09:00:00' }),                          // outside the range
    call({ type: 'out-bound', outcome: 'answered' }),                    // casing differences still count
    call({ type: 'INTERNAL', outcome: 'NO ANSWER' }),                    // internal calls are left out entirely
  ];
  const raw = [
    meeting('New Meetings', 'Ben', '2026-08-10', { companyName: 'A' }),
    meeting('Follow Ups', 'Ben', '2026-08-10', { companyName: 'B', medB: true }),
    meeting('Onboarded', 'Ben', '2026-08-11', { companyName: 'C', ppo: true }),
    meeting('No-Show', 'Ben', '2026-08-11', { companyName: 'D' }),
    meeting('Dead Leads', 'Ben', '2026-08-11', { companyName: 'E' }),
    meeting('Temporary Inactive', 'Ben', '2026-08-11', { companyName: 'F' }),
    meeting('Onboarded', 'Jane', '2026-08-12', { companyName: 'G' }),
    meeting('Onboarded', 'George', '2026-08-12', { companyName: 'H' }),   // excluded person
    meeting('Onboarded', 'Ben', '2026-07-02', { companyName: 'I' }),      // outside the range
    meeting('Follow Ups', 'Ben', '2026-08-12', { companyName: 'J' }),     // in a show stage but never confirmed
  ];
  // Management confirmed B, C, F, G (and wrongly E, which sits in Dead Leads and must still not count).
  const confirmed = new Map(['b', 'c', 'e', 'f', 'g', 'h', 'i'].map(c => [
    raw.findIndex(m => m.companyName === c.toUpperCase()), { confirmedBy: 'Boss', confirmedAt: '2026-08-12T10:00:00Z' },
  ]));
  const confirmationsByKey = new Map<string, { confirmedBy: string; confirmedAt: string }>();
  const keyed = annotateMeetings(raw, new Map());
  confirmed.forEach((info, idx) => confirmationsByKey.set(keyed[idx].meetingKey as string, info));
  const meetings = annotateMeetings(raw, confirmationsByKey);
  const att = parseAttendanceRows([['Date', '2026-08-10', '2026-08-11'], ['Ben', 'P', 'P']]);

  const run = () => computeDashboardMetrics(calls, meetings, {}, mappings, { startDate: '2026-08-10', endDate: '2026-08-14' }, att);

  it('counts calls per opener', () => {
    const ben = run().openers.find(o => o.opener === 'Ben')!;
    expect(ben.calls).toBe(5);       // 2 answered + 1 no answer + 1 inbound + 1 casing variant (INTERNAL excluded)
    expect(ben.outbound).toBe(4);
    expect(ben.inbound).toBe(1);
    expect(ben.outbound + ben.inbound).toBe(ben.calls);
    expect(ben.answered).toBe(4);
    expect(ben.noAnswer).toBe(1);
    expect(ben.connectionRate).toBeCloseTo(4 / 5);
    expect(ben.totalTalkSec).toBe(30 * 3 + 60 + 0);
    expect(run().openers.some(o => /george/i.test(o.opener))).toBe(false);
  });

  it('computes meeting funnel metrics', () => {
    const ben = run().openers.find(o => o.opener === 'Ben')!;
    expect(ben.booked).toBe(7);
    expect(ben.attended).toBe(4);        // old meetings (before 10/12) count by tab: B, C, F, J; E in Dead Leads never counts
    expect(ben.awaitingConfirmation).toBe(0); // nothing before 10/12 needs confirming
    expect(ben.noShow).toBe(1);
    expect(ben.showRate).toBeCloseTo(4 / 5);   // attended / (attended + no-show)
    expect(ben.onboarded).toBe(1);
    expect(ben.closeRate).toBeCloseTo(1 / 7);
    expect(ben.medBCount).toBe(1);
    expect(ben.medBRate).toBe(14.3);
    expect(ben.ppoCount).toBe(1);
    expect(ben.callsPerMeeting).toBe(0.7);
  });

  it('uses attendance for present days, adherence and calls per present day', () => {
    const ben = run().openers.find(o => o.opener === 'Ben')!;
    expect(ben.presentDays).toBe(2);
    expect(ben.adherenceRate).toBe(40);        // 2 of the 5 Mon-Fri days 10-14 Aug
    expect(ben.callsPerPresentDay).toBe(2.5);  // 5 calls / 2 days
  });

  it('org totals match the sum of openers, and show rate is attended / (attended + no-show)', () => {
    const { openers, totals } = run();
    expect(totals.calls).toBe(openers.reduce((n, o) => n + o.calls, 0));
    expect(totals.booked).toBe(8); // Ben 7 + Jane 1
    expect(totals.attended).toBe(5);
    expect(totals.noShow).toBe(1);
    expect(totals.showRate).toBeCloseTo(5 / 6);
  });

  it('groups periods consistently', () => {
    const { dailyBreakdown, weeklyBreakdown, monthlyBreakdown } = run();
    expect(dailyBreakdown.map(d => d.periodKey)).toEqual(['2026-08-12', '2026-08-11', '2026-08-10']);
    expect(weeklyBreakdown).toHaveLength(1);
    expect(weeklyBreakdown[0].periodKey).toBe('2026-W33');
    expect(monthlyBreakdown[0].periodKey).toBe('2026-08');
    expect(weeklyBreakdown[0].totals.calls).toBe(run().totals.calls);
  });
});

describe('shows after the confirmation start date require management confirmation', () => {
  // Added on or after 2026-10-12: a show only when management confirmed it.
  const raw = [
    meeting('Follow Ups', 'Ben', '2026-10-12', { companyName: 'A' }),
    meeting('Onboarded', 'Ben', '2026-10-12', { companyName: 'B' }),       // skipped Follow Ups: not a show until confirmed
    meeting('No-Show', 'Ben', '2026-10-13', { companyName: 'C' }),
    meeting('New Meetings', 'Ben', '2026-10-13', { companyName: 'D' }),
    meeting('New Meetings', 'Ben', '2026-10-13', { companyName: 'R', status: 'Rescheduled' }), // not a new meeting
  ];
  const range = { startDate: '2026-10-12', endDate: '2026-10-18' };
  const run = (meetings = annotateMeetings(raw, new Map())) => computeDashboardMetrics([], meetings, {}, mappings, range);

  it('counts nothing as a show until it is confirmed; only Follow Ups is awaiting', () => {
    const { openers, totals } = run();
    expect(openers[0].booked).toBe(4);                // A, B, C, D (the rescheduled row is not a meeting)
    expect(openers[0].attended).toBe(0);
    expect(openers[0].awaitingConfirmation).toBe(1);  // A only
    expect(openers[0].noShow).toBe(1);
    expect(totals.showRate).toBe(0);
  });

  it('counts a confirmed meeting even after it moves to another tab, and keeps its key', () => {
    const key = annotateMeetings(raw, new Map())[0].meetingKey as string;
    const confirmations = new Map([[key, { confirmedBy: 'Boss', confirmedAt: '2026-10-13T00:00:00Z' }]]);
    const moved = [{ ...raw[0], stage: 'Contract Sent' }, ...raw.slice(1)];
    const annotated = annotateMeetings(moved, confirmations);
    expect(annotated[0].meetingKey).toBe(key);
    const { openers } = run(annotated);
    expect(openers[0].attended).toBe(1);
    expect(openers[0].awaitingConfirmation).toBe(0);
  });

  it('never counts No-Show as a show, even if it was confirmed', () => {
    const keys = annotateMeetings(raw, new Map());
    const confirmations = new Map([[keys[2].meetingKey as string, { confirmedBy: 'Boss', confirmedAt: '2026-10-13T00:00:00Z' }]]);
    expect(run(annotateMeetings(raw, confirmations)).openers[0].attended).toBe(0);
  });

  it('only new meetings in a show tab can be confirmed; old ones already count by their tab', () => {
    const m = annotateMeetings([...raw, meeting('Follow Ups', 'Ben', '2026-10-01', { companyName: 'OLD' })], new Map());
    expect(m.map((x) => canBeConfirmed(x))).toEqual([true, true, false, false, false, false]);
    expect(isConfirmedShow(m[5])).toBe(true);      // old meeting in Follow Ups
    expect(isSkippedConfirmation(m[1])).toBe(true);
  });

  it('gives identical rows distinct keys', () => {
    const dup = [meeting('Follow Ups', 'Ben', '2026-10-12', { companyName: 'X' }), meeting('Follow Ups', 'Ben', '2026-10-12', { companyName: 'X' })];
    const keys = annotateMeetings(dup, new Map()).map(m => m.meetingKey);
    expect(new Set(keys).size).toBe(2);
  });
});

describe('attendance headers without a year', () => {
  const text = [
    ['Date', '12/28', '12/29', '1/1', '1/2'],
    ['Ben Arthur', 'P', 'H', 'Q', 'P'],
    ['Date', '1/28', '1/29', '2/1'],
    ['Ben Arthur', 'P', 'P', 'L1'],
  ];

  it('infers the year, rolling over New Year, when the dates are plain text like 12/28', () => {
    const att = parseAttendanceRows(text, { year: 2026 });
    expect(Object.keys(att.agentDaily['Ben Arthur']).sort()).toEqual([
      '2025-12-28', '2025-12-29', '2026-01-01', '2026-01-02', '2026-01-28', '2026-01-29', '2026-02-01',
    ]);
    expect(att.agentDaily['Ben Arthur']['2025-12-29']).toBe(0.5);
  });

  it('gives the same result for real date cells (serial numbers)', () => {
    const serial = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000) + 25569;
    const real = [['Date', serial('2025-12-28'), serial('2025-12-29'), serial('2026-01-01'), serial('2026-01-02')], text[1]];
    const a = parseAttendanceRows(real, { year: 2026 });
    const b = parseAttendanceRows(text.slice(0, 2), { year: 2026 });
    expect(a.agentDaily).toEqual(b.agentDaily);
  });
});
