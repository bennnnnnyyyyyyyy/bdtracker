import { callEpoch } from './callKeys';

export interface SheetImportResult {
  parsedRows: number;
  imported: number;
  duplicates: number;
  removed: number;
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

export type SheetAction = 'status' | 'check' | 'repair' | 'archive' | 'fixTimes' | 'autoArchiveOn' | 'autoArchiveOff' | 'setMapping';

/** A maintenance action on the call-log sheet (see runSheetAction_ in the Apps Script). */
export async function runSheetAction(action: SheetAction, extra: Record<string, unknown> = {}, fetchFn: Fetch = fetch): Promise<Record<string, unknown>> {
  return postToSheet<{ ok?: boolean; error?: string } & Record<string, unknown>>({ action, ...extra }, fetchFn);
}

/**
 * Hands the export rows to the sheet's Apps Script web app, which adds them to Call Logs under the sheet's lock
 * with the same rules as the Import Staging menu. Safe to repeat: rows already in the sheet are skipped.
 */
export async function sendRowsToSheet(rows: string[][], fetchFn: Fetch = fetch, options: { clock?: 'local' | 'ultatel'; replace?: boolean; backupId?: string; startChunk?: number; budgetMs?: number } = {}): Promise<SheetImportResult> {
  const url = (process.env.IMPORT_WEBHOOK_URL ?? '').trim();
  const secret = (process.env.IMPORT_WEBHOOK_SECRET ?? '').trim();
  if (!url || !secret) throw new Error('Uploading call exports is not set up yet (IMPORT_WEBHOOK_URL / IMPORT_WEBHOOK_SECRET).');

  const chunks = chunkRowsByCall(rows);
  const total: SheetImportResult = { parsedRows: rows.length, imported: 0, duplicates: 0, removed: 0, newAgents: [], checkOk: true, checkProblems: [], chunks: chunks.length, nextChunk: null };

  const startedAt = Date.now();
  for (let i = Math.max(0, options.startChunk ?? 0); i < chunks.length; i++) {
    if (options.budgetMs && i > (options.startChunk ?? 0) && Date.now() - startedAt > options.budgetMs) { total.nextChunk = i; break; }
    let body: { ok?: boolean; error?: string; imported?: number; duplicates?: number; removed?: number; newAgents?: string[]; check?: { ok: boolean; problems: string[] } };
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script web apps accept a JSON body sent as text
        body: JSON.stringify({ secret, action: 'import', clock: options.clock === 'ultatel' ? 'ultatel' : 'local', replace: options.replace === true, backupId: options.backupId, rows: chunks[i] }),
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
    total.removed += body.removed ?? 0;
    (body.newAgents ?? []).forEach((a) => { if (!total.newAgents.includes(a)) total.newAgents.push(a); });
    if (body.check && !body.check.ok) {
      total.checkOk = false;
      total.checkProblems.push(...body.check.problems);
    }
  }
  return total;
}
