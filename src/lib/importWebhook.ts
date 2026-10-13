import { callEpoch } from './callKeys';

export interface SheetImportResult {
  parsedRows: number;
  imported: number;
  duplicates: number;
  newAgents: string[];
  checkOk: boolean;
  checkProblems: string[];
  chunks: number;
}

export function isImportConfigured(): boolean {
  return Boolean(process.env.IMPORT_WEBHOOK_URL && process.env.IMPORT_WEBHOOK_SECRET);
}

/**
 * Splits rows into requests of about `size`. Rows of the same call (same Call ID timestamp) always stay in one
 * request, because the sheet decides what is new by comparing against what it already holds.
 */
export function chunkRowsByCall(rows: string[][], size = 2500): string[][][] {
  const withId: string[][] = [];
  const noId: string[][] = [];
  rows.forEach((r) => (callEpoch(r[1]) === null ? noId : withId).push(r));
  withId.sort((a, b) => (callEpoch(a[1]) as number) - (callEpoch(b[1]) as number));

  const chunks: string[][][] = [];
  let cur: string[][] = [];
  withId.forEach((r) => {
    const prev = cur[cur.length - 1];
    if (cur.length >= size && prev && callEpoch(prev[1]) !== callEpoch(r[1])) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(r);
  });
  cur.push(...noId);
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

type Fetch = typeof fetch;

/**
 * Hands the export rows to the sheet's Apps Script web app, which adds them to Call Logs under the sheet's lock
 * with the same rules as the Import Staging menu. Safe to repeat: rows already in the sheet are skipped.
 */
export async function sendRowsToSheet(rows: string[][], fetchFn: Fetch = fetch): Promise<SheetImportResult> {
  const url = process.env.IMPORT_WEBHOOK_URL;
  const secret = process.env.IMPORT_WEBHOOK_SECRET;
  if (!url || !secret) throw new Error('Uploading call exports is not set up yet (IMPORT_WEBHOOK_URL / IMPORT_WEBHOOK_SECRET).');

  const chunks = chunkRowsByCall(rows);
  const total: SheetImportResult = { parsedRows: rows.length, imported: 0, duplicates: 0, newAgents: [], checkOk: true, checkProblems: [], chunks: chunks.length };

  for (let i = 0; i < chunks.length; i++) {
    let body: { ok?: boolean; error?: string; imported?: number; duplicates?: number; newAgents?: string[]; check?: { ok: boolean; problems: string[] } };
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script web apps accept a JSON body sent as text
        body: JSON.stringify({ secret, action: 'import', rows: chunks[i] }),
        redirect: 'follow',
        signal: AbortSignal.timeout(55_000),
      });
      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error('The Apps Script web app did not answer with data. Check that it is deployed with access "Anyone" and that IMPORT_WEBHOOK_URL is the web app URL.');
      }
    } catch (err) {
      const done = total.imported + total.duplicates;
      throw new Error(`${err instanceof Error ? err.message : 'Import failed'} (${done} of ${rows.length} rows were processed before this; uploading the file again only adds what is missing).`);
    }
    if (!body.ok) throw new Error(`The sheet rejected the import: ${body.error || 'unknown error'}`);

    total.imported += body.imported ?? 0;
    total.duplicates += body.duplicates ?? 0;
    (body.newAgents ?? []).forEach((a) => { if (!total.newAgents.includes(a)) total.newAgents.push(a); });
    if (body.check && !body.check.ok) {
      total.checkOk = false;
      total.checkProblems.push(...body.check.problems);
    }
  }
  return total;
}
