import { describe, expect, it } from 'vitest';
import { computeDashboardMetrics, resolveOpener } from '../src/lib/analytics';
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
  ];
  const meetings = [
    meeting('New Meetings', 'Ben', '2026-08-10'),
    meeting('Follow Ups', 'Ben', '2026-08-10', { medB: true }),
    meeting('Onboarded', 'Ben', '2026-08-11', { ppo: true }),
    meeting('No-Show', 'Ben', '2026-08-11'),
    meeting('Dead Leads', 'Ben', '2026-08-11'),
    meeting('Onboarded', 'Jane', '2026-08-12'),
    meeting('Onboarded', 'George', '2026-08-12'),                       // excluded
    meeting('Onboarded', 'Ben', '2026-07-02'),                           // outside the range
  ];
  const att = parseAttendanceRows([['Date', '2026-08-10', '2026-08-11'], ['Ben', 'P', 'P']]);

  const run = () => computeDashboardMetrics(calls, meetings, {}, mappings, { startDate: '2026-08-10', endDate: '2026-08-14' }, att);

  it('counts calls per opener', () => {
    const ben = run().openers.find(o => o.opener === 'Ben')!;
    expect(ben.calls).toBe(5);       // 2 answered + 1 no answer + 1 inbound + 1 casing variant
    expect(ben.outbound).toBe(4);
    expect(ben.inbound).toBe(1);
    expect(ben.answered).toBe(4);
    expect(ben.noAnswer).toBe(1);
    expect(ben.connectionRate).toBeCloseTo(4 / 5);
    expect(ben.totalTalkSec).toBe(30 * 3 + 60 + 0);
    expect(run().openers.some(o => /george/i.test(o.opener))).toBe(false);
  });

  it('computes meeting funnel metrics', () => {
    const ben = run().openers.find(o => o.opener === 'Ben')!;
    expect(ben.booked).toBe(5);
    expect(ben.attended).toBe(2);        // Follow Ups + Onboarded
    expect(ben.noShow).toBe(1);
    expect(ben.showRate).toBeCloseTo(2 / 3);   // attended / (attended + no-show)
    expect(ben.onboarded).toBe(1);
    expect(ben.closeRate).toBeCloseTo(1 / 5);
    expect(ben.medBCount).toBe(1);
    expect(ben.medBRate).toBe(20);
    expect(ben.ppoCount).toBe(1);
    expect(ben.callsPerMeeting).toBe(1);
  });

  it('uses attendance for present days, adherence and calls per present day', () => {
    const ben = run().openers.find(o => o.opener === 'Ben')!;
    expect(ben.presentDays).toBe(2);
    expect(ben.adherenceRate).toBe(40);        // 2 of the 5 Mon-Fri days 10-14 Aug
    expect(ben.callsPerPresentDay).toBe(2.5);  // 5 calls / 2 days
  });

  it('org totals match the sum of openers, and show rate is attended / booked', () => {
    const { openers, totals } = run();
    expect(totals.calls).toBe(openers.reduce((n, o) => n + o.calls, 0));
    expect(totals.booked).toBe(6); // Ben 5 + Jane 1
    expect(totals.attended).toBe(3);
    expect(totals.showRate).toBeCloseTo(3 / 6);
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
