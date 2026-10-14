import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/lib/csv';
import { parseCsv } from '../src/lib/ultatelFile';
import { buildMeetingsTable, buildOverviewTable, buildPeriodTable, buildTable, CSV_KINDS } from '../src/lib/exportXlsx';
import { computeDashboardMetrics } from '../src/lib/analytics';
import { annotateMeetings } from '../src/lib/meetings';
import type { DashboardResponse } from '../src/types/dashboard';

describe('CSV writing', () => {
  it('quotes commas, quotes and line breaks, and round-trips through the reader', () => {
    const rows = [['a', 'b,c', 'say "hi"', 'line1\nline2', 5, null, undefined]];
    const text = toCsv(rows);
    expect(text).toBe('a,"b,c","say ""hi""","line1\nline2",5,,');
    expect(parseCsv(text)).toEqual([['a', 'b,c', 'say "hi"', 'line1\nline2', '5', '', '']]);
  });

  it('neutralises spreadsheet formulas but leaves phone numbers alone', () => {
    expect(toCsv([['=SUM(A1)', '@cmd', '+cmd', '-x', '+16156173189', '-5']])).toBe("'=SUM(A1),'@cmd,'+cmd,'-x,+16156173189,-5");
  });
});

describe('dashboard tables', () => {
  const meetings = annotateMeetings([
    { stage: 'Follow Ups', opener: 'Ben', dateAdded: '2026-08-10', companyName: 'Acme, Inc', authorizedPerson: 'Zed' },
    { stage: 'New Meetings', opener: 'Ben', dateAdded: '2026-08-11', companyName: 'Beta' },
  ], new Map());
  const key = meetings[0].meetingKey as string;
  const confirmed = annotateMeetings(meetings.map(({ meetingKey, showConfirmed, confirmedBy, confirmedAt, ...m }) => (void meetingKey, void showConfirmed, void confirmedBy, void confirmedAt, m)), new Map([[key, { confirmedBy: 'Boss', confirmedAt: '2026-08-12T10:00:00Z' }]]));
  const result = computeDashboardMetrics([], confirmed, {}, [{ agent: 'Ben Arthur', opener: 'Ben' }], { startDate: '2026-08-10', endDate: '2026-08-14' });
  const data = { ...result, stages: ['New Meetings', 'Follow Ups'], meetings: result.filteredMeetings, calls: [], agentMappings: [], lastUpdated: '' } as unknown as DashboardResponse;

  it('every table has as many cells per row as headers', () => {
    CSV_KINDS.forEach(({ kind }) => {
      const t = buildTable(data, kind);
      t.rows.forEach((row) => expect(row).toHaveLength(t.headers.length));
    });
  });

  it('meetings include the show confirmation and survive CSV round-trip', () => {
    const t = buildMeetingsTable(data);
    const acme = t.rows.find((r) => r[4] === 'Acme, Inc')!;
    expect(acme.slice(8)).toEqual(['Yes', 'Boss', '2026-08-12T10:00:00Z']);
    expect(parseCsv(toCsv([t.headers, ...t.rows]))[1][4]).toBe('Acme, Inc');
  });

  it('overview has a team totals row and the new confirmation columns', () => {
    const t = buildOverviewTable(data);
    expect(t.headers).toContain('Confirmed Shows');
    expect(t.headers).toContain('Awaiting Confirmation');
    expect(t.rows[t.rows.length - 1][0]).toBe('TOTALS / TEAM');
  });

  it('period tables use the period name as the first column', () => {
    expect(buildPeriodTable(data.weeklyBreakdown, 'Week').headers[0]).toBe('Week');
  });
});
