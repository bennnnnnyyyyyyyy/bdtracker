import type { DailyTotalRow } from './dailyTotals';
import { callEpoch } from './callKeys';

export interface SheetImportResult {
  parsedRows: number;
  imported: number;
  duplicates: number;
  newAgents: string[];
  checkOk: boolean;
  checkProblems: string[];
  chunks: number;
  /** Set when a time budget stopped the run early: send the file again with startChunk = this to continue. */
  nextChunk: number | null;
}

/** Names of the settings that are missing or empty (the server only sees them after a redeploy / restart). */
export function missingImportSettings(): string[] {
  return ['IMPORT_WEBHOOK_URL', 'IMPORT_WEBHOOK_SECRET'].filter((name) => !(process.env[name] ?? '').trim());
}

export function isImportConfigured(): boolean {
  return missingImportSettings().length === 0;
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

/** Sends one request to the sheet's Apps Script web app and returns its JSON reply (errors become thrown messages). */
async function postToSheet<T extends { ok?: boolean; error?: string }>(payload: Record<string, unknown>, fetchFn: Fetch): Promise<T> {
  const url = (process.env.IMPORT_WEBHOOK_URL ?? '').trim();
  const secret = (process.env.IMPORT_WEBHOOK_SECRET ?? '').trim();
  if (!url || !secret) throw new Error('The sheet connection is not set up yet (IMPORT_WEBHOOK_URL / IMPORT_WEBHOOK_SECRET).');
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script web apps accept a JSON body sent as text
    body: JSON.stringify({ secret, ...payload }),
    redirect: 'follow',
    signal: AbortSignal.timeout(55_000),
  });
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(describeBadReply(text));
  }
  if (!body.ok) throw new Error(`The sheet rejected the request: ${body.error || 'unknown error'}`);
  return body;
}

/** Explains a reply that is not JSON, quoting what Google actually sent (HTML tags removed). */
function describeBadReply(text: string): string {
  const plain = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
  return `The Apps Script web app did not answer with data. It said: "${plain || 'nothing'}". Check that the web app is deployed with access "Anyone", that IMPORT_WEBHOOK_URL is its current /exec URL (a new deployment creates a new URL; use Manage deployments > edit > New version to keep the old one), and that the script did not run out of time.`;
}

export type SheetAction = 'status' | 'check' | 'repair' | 'archive' | 'fixTimes' | 'autoArchiveOn' | 'autoArchiveOff' | 'setMapping' | 'replaceStatus';

/** A maintenance action on the call-log sheet (see runSheetAction_ in the Apps Script). */
export async function runSheetAction(action: SheetAction, extra: Record<string, unknown> = {}, fetchFn: Fetch = fetch): Promise<Record<string, unknown>> {
  return postToSheet<{ ok?: boolean; error?: string } & Record<string, unknown>>({ action, ...extra }, fetchFn);
}

/**
 * Hands the export rows to the sheet's Apps Script web app, which adds them to Call Logs under the sheet's lock
 * with the same rules as the Import Staging menu. Safe to repeat: rows already in the sheet are skipped.
 */
export async function sendRowsToSheet(rows: string[][], fetchFn: Fetch = fetch, options: { clock?: 'local' | 'ultatel'; skipCheck?: boolean; startChunk?: number; budgetMs?: number } = {}): Promise<SheetImportResult> {
  const url = (process.env.IMPORT_WEBHOOK_URL ?? '').trim();
  const secret = (process.env.IMPORT_WEBHOOK_SECRET ?? '').trim();
  if (!url || !secret) throw new Error('Uploading call exports is not set up yet (IMPORT_WEBHOOK_URL / IMPORT_WEBHOOK_SECRET).');

  const chunks = chunkRowsByCall(rows);
  const total: SheetImportResult = { parsedRows: rows.length, imported: 0, duplicates: 0, newAgents: [], checkOk: true, checkProblems: [], chunks: chunks.length, nextChunk: null };

  const startedAt = Date.now();
  for (let i = Math.max(0, options.startChunk ?? 0); i < chunks.length; i++) {
    if (options.budgetMs && i > (options.startChunk ?? 0) && Date.now() - startedAt > options.budgetMs) { total.nextChunk = i; break; }
    let body: { ok?: boolean; error?: string; imported?: number; duplicates?: number; newAgents?: string[]; check?: { ok: boolean; problems: string[] } };
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script web apps accept a JSON body sent as text
        body: JSON.stringify({ secret, action: 'import', clock: options.clock === 'ultatel' ? 'ultatel' : 'local', skipCheck: options.skipCheck === true, rows: chunks[i] }),
        redirect: 'follow',
        signal: AbortSignal.timeout(55_000),
      });
      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(describeBadReply(text));
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

/**
 * Replace mode: hands the sheet the call-identifying columns of the whole file. The sheet then backs up and cleans
 * every affected tab in the background (a trigger), because that takes longer than one web request may. Progress
 * comes from the "replaceStatus" action.
 */
export async function startReplace(rows: string[][], backupId: string, fetchFn: Fetch = fetch): Promise<Record<string, unknown>> {
  let minEpoch = Infinity;
  let maxEpoch = -Infinity;
  const KEEP = [1, 2, 3, 4, 8, 9, 10];
  const slim: string[][] = [];
  rows.forEach((r) => {
    const e = callEpoch(r[1]);
    if (e === null) return;
    minEpoch = Math.min(minEpoch, e);
    maxEpoch = Math.max(maxEpoch, e);
    slim.push(r.map((cell, i) => (KEEP.includes(i) ? cell : '')));
  });
  if (slim.length === 0) throw new Error('The file has no calls with a Call ID timestamp, so there is nothing to replace.');
  const reply = await postToSheet<{ ok?: boolean; error?: string; job?: Record<string, unknown> }>({ action: 'replaceStart', minEpoch, maxEpoch, backupId, rows: slim }, fetchFn);
  return reply.job ?? {};
}

/**
 * Stores per-extension totals for one or more days in the sheet's Daily Totals tab. A day uploaded again is replaced.
 * `source` is saved next to the rows ("daily", or a description of the period that was spread over its working days).
 */
export async function sendDailyToSheet(
  days: { date: string; rows: DailyTotalRow[] }[],
  source: string,
  fetchFn: Fetch = fetch,
): Promise<{ days: number; rows: number; replaced: number; newAgents: string[] }> {
  const reply = await postToSheet<{ ok?: boolean; error?: string; days: number; rows: number; replaced: number; newAgents: string[] }>(
    { action: 'importDaily', days, source },
    fetchFn,
  );
  return { days: reply.days, rows: reply.rows, replaced: reply.replaced, newAgents: reply.newAgents ?? [] };
}
