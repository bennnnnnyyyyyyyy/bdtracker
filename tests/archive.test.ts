import { beforeEach, describe, expect, it, vi } from 'vitest';
import { archiveMonthOfTitle, monthKeysForRange } from '../src/lib/archive';

describe('archive helpers', () => {
  it('recognises monthly archive tabs only', () => {
    expect(archiveMonthOfTitle('Call Logs 2026-09')).toBe('2026-09');
    expect(archiveMonthOfTitle('Call Logs')).toBeNull();
    expect(archiveMonthOfTitle('Call Logs backup 2026-10-12 1533')).toBeNull();
    expect(archiveMonthOfTitle('Call Logs 2026-13')).toBeNull();
  });

  it('lists the months a range touches, widened by 2 days', () => {
    expect(monthKeysForRange('2026-10-12', '2026-10-12')).toEqual(['2026-10']);
    expect(monthKeysForRange('2026-10-01', '2026-10-31')).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(monthKeysForRange('2026-08-15', '2026-10-05')).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(monthKeysForRange('2025-12-30', '2026-01-02')).toEqual(['2025-12', '2026-01']);
    expect(monthKeysForRange(undefined, '2026-10-12')).toEqual([]);
    expect(monthKeysForRange('2026-10-12', '2026-10-01')).toEqual([]);
  });
});

// ---- composing active + archived calls, against a fake Google Sheets client ----
const state = vi.hoisted(() => ({ reads: [] as string[], titles: ['Call Logs', 'Call Logs 2026-08', 'Call Logs 2026-09', 'Call Logs backup 2026-10-12 1533', 'Agent Mapping'] }));

vi.mock('googleapis', () => {
  const row = (id: string, date: string, to: string) => [date, id, '18443910603', to, '114 (MMS-Selene Myles)', 'BD', '', '', 'OUT-Bound', 'ANSWERED', '0:16', '', ''];
  const tabs: Record<string, unknown[][]> = {
    'Call Logs': [row('1791808392.14495', '10-12-2026 15:33:12', '1')],
    'Call Logs 2026-08': [row('1785000000.1', '07-31-2026 20:00:00', '2'), row('1785000100.2', '07-31-2026 20:01:40', '3')],
    'Call Logs 2026-09': [row('1788000000.3', '08-29-2026 12:00:00', '4')],
  };
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: state.titles.map((title) => ({ properties: { title } })) } }),
      values: {
        get: async ({ range }: { range: string }) => {
          state.reads.push(range);
          const tab = range.replace(/^'?(.*?)'?!.*$/, '$1');
          if (tab === 'Agent Mapping') return { data: { values: [['Selene Myles', 'Selene']] } };
          if (tab === 'Attendance') return { data: { values: [] } };
          return { data: { values: tabs[tab] ?? [] } };
        },
        batchGet: async ({ ranges }: { ranges: string[] }) => ({ data: { valueRanges: ranges.map(() => ({ values: [] })) } }),
      },
    },
  };
  return { google: { auth: { JWT: class {} }, sheets: () => sheets } };
});

describe('reading archive tabs', () => {
  beforeEach(() => {
    state.reads.length = 0;
    process.env.GOOGLE_CLIENT_EMAIL = 'x@example.com';
    process.env.GOOGLE_PRIVATE_KEY = 'key';
  });

  it('reads only the active log without a date range, and archive tabs when a range reaches them', async () => {
    const { getDashboardRawData, invalidateDashboardCache } = await import('../src/lib/sheets');
    invalidateDashboardCache();

    const noRange = await getDashboardRawData({});
    expect(noRange.calls.map((c) => c.callId)).toEqual(['1791808392.14495']);
    expect(state.reads.some((r) => r.includes('Call Logs 2026'))).toBe(false);

    // A range inside October only needs the active log (no archive tab for October exists).
    const october = await getDashboardRawData({ startDate: '2026-10-05', endDate: '2026-10-12' });
    expect(october.calls).toHaveLength(1);

    const summer = await getDashboardRawData({ startDate: '2026-07-25', endDate: '2026-08-31' });
    expect(summer.calls.map((c) => c.callId).sort()).toEqual(['1785000000.1', '1785000100.2', '1788000000.3', '1791808392.14495'].sort());

    // Archive tabs are cached: asking again does not read them again.
    const readsBefore = state.reads.filter((r) => r.includes('Call Logs 2026')).length;
    await getDashboardRawData({ startDate: '2026-07-25', endDate: '2026-08-31' });
    expect(state.reads.filter((r) => r.includes('Call Logs 2026')).length).toBe(readsBefore);
  });

  it('ignores months that have no archive tab and does not read backup tabs', async () => {
    const { getDashboardRawData, invalidateDashboardCache } = await import('../src/lib/sheets');
    invalidateDashboardCache();
    const res = await getDashboardRawData({ startDate: '2026-01-01', endDate: '2026-12-31' });
    expect(res.calls.length).toBe(4);
    expect(state.reads.some((r) => r.includes('backup'))).toBe(false);
  });
});
