import { describe, expect, it, vi } from 'vitest';
import { mapCallExportRows, parseCallExportFile, parseCsv } from '../src/lib/ultatelFile';
import { chunkRowsByCall, runSheetAction, sendRowsToSheet } from '../src/lib/importWebhook';

const HEADER = 'Call Date,Call ID,From,To,Extension,Department,DID,Description,Type,Outcome,Duration,Notes,Call Path,Team Call';
const csv = [
  HEADER,
  '"10-12-2026 06:33:12","1791808392.14495"," 18443910603","4154400444","114 (MMS-Selene Myles)","Business Development Team","","","OUT-Bound","ANSWERED","00:16","","",""',
  '"10-12-2026 08:12:16","1791814336.17345","8173300176, 8173300176","111","111 (MMS-Nora Atkins)","Business Development Team","9174102589","MMS-Nora Atkins","IN-Bound","ANSWERED","01:09","","From 8173300176 ==> Did 2132626575 (mms-nora atkins), answered",""',
].join('\r\n');

describe('reading an Ultatel Call Details export', () => {
  it('parses quoted CSV with commas, quotes and a BOM', () => {
    const rows = parseCsv('﻿a,b\n"x, y","say ""hi"""\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });

  it('maps the export to the 13 sheet columns, ignoring the extra "Team Call" column', () => {
    const parsed = parseCallExportFile(Buffer.from(csv), 'Call Details.csv');
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toHaveLength(13);
    expect(parsed.rows[0].slice(0, 5)).toEqual(['10-12-2026 06:33:12', '1791808392.14495', '18443910603', '4154400444', '114 (MMS-Selene Myles)']);
    expect(parsed.rows[0][10]).toBe('00:16');
    expect(parsed.rows[1][2]).toBe('8173300176, 8173300176');
    expect(parsed.rows[1][12]).toContain('answered');
  });

  it('copes with reordered columns', () => {
    const table = [['Call ID', 'Call Date', 'Extension', 'From', 'To', 'Type', 'Outcome', 'Duration'], ['1791808392.1', '10-12-2026 06:33:12', '114 (MMS-X)', '1', '2', 'OUT-Bound', 'ANSWERED', '0:16']];
    const parsed = mapCallExportRows(table);
    expect(parsed.rows[0].slice(0, 4)).toEqual(['10-12-2026 06:33:12', '1791808392.1', '1', '2']);
  });

  it('rejects files that are not call exports', () => {
    expect(parseCallExportFile(Buffer.from('Name,Age\nBen,3'), 'x.csv').error).toMatch(/Call ID/);
    expect(parseCallExportFile(Buffer.from('Call ID,Call Date\n1,2'), 'x.csv').error).toMatch(/missing/);
    expect(parseCallExportFile(Buffer.from(`${HEADER}\n`), 'x.csv').error).toMatch(/no call rows/);
  });
});

const row = (id: string, to = '1') => ['d', id, 'f', to, 'e', '', '', '', 'OUT-Bound', 'ANSWERED', '0:10', '', ''];

describe('splitting an upload into requests', () => {
  it('keeps every row of the same call in one request', () => {
    const rows = [row('1791000001.1'), row('1791000002.1'), row('1791000002.1'), row('1791000002.1'), row('1791000003.1')];
    const chunks = chunkRowsByCall(rows, 2);
    expect(chunks.flat()).toHaveLength(5);
    const withSecond = chunks.filter((c) => c.some((r) => r[1].startsWith('1791000002')));
    expect(withSecond).toHaveLength(1); // the three rows of call ...002 are together
  });

  it('puts rows without a usable Call ID in the last request', () => {
    const chunks = chunkRowsByCall([row('abc'), row('1791000001.1')], 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0][chunks[0].length - 1][1]).toBe('abc');
  });
});

describe('sending rows to the sheet', () => {
  const env = () => { process.env.IMPORT_WEBHOOK_URL = 'https://script.example/exec'; process.env.IMPORT_WEBHOOK_SECRET = 's'; };
  const reply = (body: unknown) => ({ text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }) as Response;

  it('adds up the results of every request', async () => {
    env();
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(reply({ ok: true, imported: 3, duplicates: 1, newAgents: ['A'], check: { ok: true, problems: [] } }))
      .mockResolvedValueOnce(reply({ ok: true, imported: 2, duplicates: 0, newAgents: ['A', 'B'], check: { ok: false, problems: ['Ben: export 5, Call Logs 6 (+1)'] } }));
    const rows = Array.from({ length: 2600 }, (_, i) => row(`${1791000001 + i}.1`)); // more than one request's worth
    const result = await sendRowsToSheet(rows, fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ imported: 5, duplicates: 1, chunks: 2, checkOk: false, newAgents: ['A', 'B'] });
    expect(result.checkProblems).toEqual(['Ben: export 5, Call Logs 6 (+1)']);
  });

  it('reports a sheet error and a non-JSON reply clearly', async () => {
    env();
    const rows = [row('1791000001.1')];
    await expect(sendRowsToSheet(rows, vi.fn().mockResolvedValue(reply({ ok: false, error: 'Unauthorized' })) as unknown as typeof fetch)).rejects.toThrow(/Unauthorized/);
    await expect(sendRowsToSheet(rows, vi.fn().mockResolvedValue(reply('<html>Sign in</html>')) as unknown as typeof fetch)).rejects.toThrow(/Anyone/);
  });

  it('refuses to run when not configured', async () => {
    delete process.env.IMPORT_WEBHOOK_URL;
    await expect(sendRowsToSheet([row('1791000001.1')], vi.fn() as unknown as typeof fetch)).rejects.toThrow(/not set up/);
  });
});

describe('sheet maintenance actions', () => {
  const reply = (body: unknown) => ({ text: async () => JSON.stringify(body) }) as Response;

  it('sends the action and extra data with the secret, and returns the sheet reply', async () => {
    process.env.IMPORT_WEBHOOK_URL = 'https://script.example/exec';
    process.env.IMPORT_WEBHOOK_SECRET = 'shh';
    const fetchFn = vi.fn().mockResolvedValue(reply({ ok: true, repair: { duplicates: 3 } }));
    const result = await runSheetAction('repair', { entries: [] }, fetchFn as unknown as typeof fetch);
    expect(result).toMatchObject({ repair: { duplicates: 3 } });
    const sent = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(sent).toMatchObject({ secret: 'shh', action: 'repair', entries: [] });
  });

  it('turns a rejection into an error message', async () => {
    process.env.IMPORT_WEBHOOK_URL = 'https://script.example/exec';
    process.env.IMPORT_WEBHOOK_SECRET = 'shh';
    await expect(runSheetAction('archive', {}, vi.fn().mockResolvedValue(reply({ ok: false, error: 'Unknown action' })) as unknown as typeof fetch)).rejects.toThrow(/Unknown action/);
  });
});
