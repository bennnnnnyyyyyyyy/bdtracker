import { describe, expect, it } from 'vitest';
import { needsAttention, topPerformers } from '../src/lib/insights';
import { periodDays, periodElapsed, scaledTarget } from '../src/lib/targets';
import type { OpenerStats } from '../src/types/dashboard';

function agent(over: Partial<OpenerStats>): OpenerStats {
  return {
    opener: 'A', calls: 100, outbound: 100, inbound: 0, answered: 35, noAnswer: 65, answerRate: 0.35, connectionRate: 0.35,
    totalTalkSec: 0, avgCallSec: 0, booked: 5, medBCount: 0, medBRate: 0, ppoCount: 0, ppoRate: 0, noShow: 1, attended: 3,
    awaitingConfirmation: 0, showRate: 0.75, onboarded: 1, closeRate: 0.2, callsPerMeeting: 20, stageCounts: {},
    presentDays: 5, callsPerPresentDay: 20,
    ...over,
  } as OpenerStats;
}

const week = { startDate: '2026-10-12', endDate: '2026-10-18' };

describe('targets helpers', () => {
  it('counts inclusive days and scales weekly goals', () => {
    expect(periodDays('2026-10-12', '2026-10-18')).toBe(7);
    expect(periodDays('2026-10-01', '2026-10-30')).toBe(30);
    expect(scaledTarget(100, 14, 3)).toBe(600);
    expect(scaledTarget(100, 7, 0)).toBe(100); // at least one agent
  });

  it('reports how far through a period we are', () => {
    expect(periodElapsed('2026-10-12', '2026-10-18', new Date(2026, 9, 15))).toBeCloseTo(4 / 7);
    expect(periodElapsed('2026-10-12', '2026-10-18', new Date(2026, 10, 1))).toBe(1);
    expect(periodElapsed('2026-10-12', '2026-10-18', new Date(2026, 9, 1))).toBe(0);
  });
});

describe('needsAttention', () => {
  it('flags no activity and low show rate as urgent', () => {
    const items = needsAttention([agent({ opener: 'Idle', calls: 0, callsPerPresentDay: 0 }), agent({ opener: 'NoShows', attended: 1, noShow: 4, showRate: 0.2 }), agent({ opener: 'Fine' })], { targets: null, ...week });
    expect(items.map(i => i.agent).sort()).toEqual(['Idle', 'NoShows']);
    expect(items.every(i => i.severity === 'high')).toBe(true);
  });

  it('ignores show rate until enough meetings are rated', () => {
    const items = needsAttention([agent({ attended: 0, noShow: 2, showRate: 0 })], { targets: null, ...week });
    expect(items).toHaveLength(0);
  });

  it('flags only low call pace relative to targets and skips targets early in a period', () => {
    const behind = agent({ opener: 'Behind', calls: 10, callsPerPresentDay: 20 });
    // period fully over -> expected = full target
    const over = needsAttention([behind], { targets: { calls: 100, meetings: 0, onboarded: 0 }, startDate: '2020-01-06', endDate: '2020-01-12' });
    expect(over[0]?.reasons[0]).toMatch(/calls: 10 vs ~100/);
    // period just starting -> no judgement yet
    const today = new Date();
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const end = new Date(today); end.setDate(end.getDate() + 29);
    expect(needsAttention([behind], { targets: { calls: 100, meetings: 0, onboarded: 0 }, startDate: ymd(today), endDate: ymd(end) })).toHaveLength(0);
  });
});

describe('topPerformers', () => {
  it('ranks by onboarded, then booked, then calls and skips agents with no calls', () => {
    const top = topPerformers([
      agent({ opener: 'A', onboarded: 1, booked: 9 }),
      agent({ opener: 'B', onboarded: 3, booked: 2 }),
      agent({ opener: 'C', onboarded: 3, booked: 5 }),
      agent({ opener: 'Idle', onboarded: 9, calls: 0 }),
    ], 3);
    expect(top.map(o => o.opener)).toEqual(['C', 'B', 'A']);
  });
});

describe('show rate needs settled results', () => {
  it('does not flag a low show rate while meetings are waiting for confirmation, but says they are waiting', () => {
    const items = needsAttention([agent({ attended: 0, noShow: 3, showRate: 0, awaitingConfirmation: 2 })], { targets: null, ...week });
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('medium');
    expect(items[0].reasons.join(' ')).toContain('waiting for show confirmation');
    expect(items[0].reasons.join(' ')).not.toContain('Show rate');
  });
  it('flags a low show rate once everything is settled', () => {
    const items = needsAttention([agent({ attended: 1, noShow: 4, showRate: 0.2, awaitingConfirmation: 0 })], { targets: null, ...week });
    expect(items[0].severity).toBe('high');
  });
});
