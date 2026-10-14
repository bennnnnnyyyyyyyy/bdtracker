import { describe, expect, it, vi } from 'vitest';
import { parseCsv } from '../src/lib/ultatelFile';
import { runSheetAction, sendDailyToSheet } from '../src/lib/importWebhook';

const reply = (body: unknown) => ({ text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }) as Response;
const env = () => {
  process.env.IMPORT_WEBHOOK_URL = 'https://script.example/exec';
  process.env.IMPORT_WEBHOOK_SECRET = 'shh';
};

describe('CSV reading', () => {
  it('parses quoted CSV with commas, quotes and a BOM', () => {
    expect(parseCsv('﻿a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });
});

describe('sheet connection', () => {
  it('sends the action and extra data with the secret, and returns the sheet reply', async () => {
    env();
    const fetchFn = vi.fn().mockResolvedValue(reply({ ok: true, repair: { duplicates: 3 } }));
    const result = await runSheetAction('repair', { entries: [] }, fetchFn as unknown as typeof fetch);
    expect(result).toMatchObject({ repair: { duplicates: 3 } });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toMatchObject({ secret: 'shh', action: 'repair', entries: [] });
  });

  it('turns a rejection into an error message', async () => {
    env();
    await expect(runSheetAction('archive', {}, vi.fn().mockResolvedValue(reply({ ok: false, error: 'Unknown action' })) as unknown as typeof fetch)).rejects.toThrow(/Unknown action/);
  });

  it('quotes what Google answered when the reply is not JSON', async () => {
    env();
    await expect(runSheetAction('status', {}, vi.fn().mockResolvedValue(reply('<html><body>Sign in to continue</body></html>')) as unknown as typeof fetch)).rejects.toThrow(/Sign in to continue/);
  });

  it('refuses to run when the connection is not set up', async () => {
    delete process.env.IMPORT_WEBHOOK_URL;
    await expect(runSheetAction('status', {}, vi.fn() as unknown as typeof fetch)).rejects.toThrow(/not set up/);
  });

  it('sends daily totals with their days and source', async () => {
    env();
    const fetchFn = vi.fn().mockResolvedValue(reply({ ok: true, days: 1, rows: 2, replaced: 0, newAgents: ['A'], resolved: 'Rick Nelson', protectedRows: 1 }));
    const row = { extension: '103 (MMS-Rick Nelson)', agent: 'Rick Nelson', department: '', outAnswered: 1, outUnanswered: 1, inAnswered: 0, inUnanswered: 0, totalCalls: 2, durationSec: 10, acd: 0 };
    const result = await sendDailyToSheet([{ date: '2026-07-01', rows: [row] }], 'daily', fetchFn as unknown as typeof fetch);
    expect(result).toMatchObject({ days: 1, rows: 2, newAgents: ['A'], resolved: 'Rick Nelson', protectedDays: 1 });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toMatchObject({ action: 'importDaily', source: 'daily', days: [{ date: '2026-07-01' }] });
  });
});
