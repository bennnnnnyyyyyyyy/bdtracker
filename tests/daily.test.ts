import { describe, expect, it } from 'vitest';
import { dailyRowsToCalls, dateFromFileName, looksLikeDailyTotals, parseDailyTotalsRows, spreadOverDays, workingDaysBetween } from '../src/lib/dailyTotals';
import { computeDashboardMetrics } from '../src/lib/analytics';

const table: unknown[][] = [
  ['Total Calls Per Extension'],
  [null, 'Extension', 'Department', 'Out Answered Calls', 'Out UnAnswered Calls', 'In Answered Calls', 'In Unanswered Calls', 'Total Calls', 'Total Duration', 'ACD'],
  [null, '103 (MMS-Rick Nelson)', 'Business Development Team', 440, 195, 8, 15, 658, '5 H , 13.9 M', 0.8],
  [null, '104 (MMS-Eva Christian)', 'OPS', 1334, 151, 22, 70, 1577, '14 H , 12.32 M', 0.65],
  [null, '152 (MMS-Jasmine Green)', null, 9, 0, 1, 0, 10, '0 H , 8.76 M', 0.93],
];

describe('Total Calls Per Extension report', () => {
  it('is recognised and parsed', () => {
    expect(looksLikeDailyTotals(table)).toBe(true);
    expect(looksLikeDailyTotals([['Call Date', 'Call ID']])).toBe(false);
    const { rows } = parseDailyTotalsRows(table);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ agent: 'Rick Nelson', outAnswered: 440, outUnanswered: 195, inAnswered: 8, inUnanswered: 15, totalCalls: 658 });
    expect(rows[0].durationSec).toBe(Math.round((5 * 60 + 13.9) * 60));
  });

  it('reads the day from the file name', () => {
    const today = new Date('2026-10-14T08:00:00Z');
    expect(dateFromFileName('Total_Calls_Per_Extension_JULY_1.xlsx', today)).toBe('2026-07-01');
    expect(dateFromFileName('Total Calls Per Extension Oct-12.csv', today)).toBe('2026-10-12');
    expect(dateFromFileName('report 2026-08-09.xlsx', today)).toBe('2026-08-09');
    expect(dateFromFileName('report 08-09-2026.xlsx', today)).toBe('2026-08-09');
    expect(dateFromFileName('report_12_30.xlsx', today)).toBe('2025-12-30'); // not in the future
    expect(dateFromFileName('Total_Calls_Per_Extension.xlsx', today)).toBeNull();
  });

  it('turns a day into weighted records and skips other departments', () => {
    const { rows } = parseDailyTotalsRows(table);
    const calls = dailyRowsToCalls('2026-07-01', rows);
    expect(calls.map((c) => c.agent)).not.toContain('Eva Christian'); // OPS
    expect(calls.find((c) => c.agent === 'Jasmine Green')).toBeTruthy(); // no department: kept
    // an explicit Opener name keeps an OPS agent
    const kept = dailyRowsToCalls('2026-07-01', rows, new Map([['eva christian', 'Eva']]));
    expect(kept.map((c) => c.agent)).toContain('Eva Christian');
    // "ignore" does not count as an explicit name
    expect(dailyRowsToCalls('2026-07-01', rows, new Map([['eva christian', 'ignore']])).map((c) => c.agent)).not.toContain('Eva Christian');
  });

  it('feeds the dashboard formulas through weights', () => {
    const { rows } = parseDailyTotalsRows(table);
    const calls = dailyRowsToCalls('2026-07-01', rows);
    const res = computeDashboardMetrics(calls, [], {}, [{ agent: 'Rick Nelson', opener: 'Rick' }], { startDate: '2026-07-01', endDate: '2026-07-01' });
    const rick = res.openers.find((o) => o.opener === 'Rick')!;
    expect(rick.calls).toBe(658);
    expect(rick.answered).toBe(448);
    expect(rick.connectionRate).toBeCloseTo(448 / 658, 4);
    expect(res.dailyBreakdown.length).toBe(1);
  });

  it('spreads a period over its working days without losing a call', () => {
    const days = workingDaysBetween('2026-07-01', '2026-07-31');
    expect(days).toHaveLength(23); // July 2026 has 23 Mon-Fri days
    expect(days[0]).toBe('2026-07-01');
    expect(days).not.toContain('2026-07-04'); // Saturday
    const { rows } = parseDailyTotalsRows(table);
    const spread = spreadOverDays(rows, days);
    const sum = (f: (r: (typeof rows)[number]) => number) => spread.reduce((t, d) => t + d.rows.reduce((u, r) => u + f(r), 0), 0);
    expect(sum((r) => r.totalCalls)).toBe(rows.reduce((t, r) => t + r.totalCalls, 0));
    expect(sum((r) => r.outAnswered)).toBe(440 + 1334 + 9);
    expect(sum((r) => r.durationSec)).toBe(rows.reduce((t, r) => t + r.durationSec, 0));
    expect(Math.max(...spread.map((d) => d.rows.find((r) => r.agent === 'Rick Nelson')?.totalCalls ?? 0))).toBeLessThanOrEqual(32);
  });
});
