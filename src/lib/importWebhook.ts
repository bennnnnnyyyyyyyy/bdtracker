import type { DailyTotalRow } from './dailyTotals';

/** Names of the settings that are missing or empty (the server only sees them after a redeploy / restart). */
export function missingImportSettings(): string[] {
  return ['IMPORT_WEBHOOK_URL', 'IMPORT_WEBHOOK_SECRET'].filter((name) => !(process.env[name] ?? '').trim());
}

export function isImportConfigured(): boolean {
  return missingImportSettings().length === 0;
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

export type SheetAction = 'status' | 'check' | 'repair' | 'archive' | 'fixTimes' | 'autoArchiveOn' | 'autoArchiveOff' | 'setMapping' | 'rebuildTotals';

/** A maintenance action on the call-log sheet (see runSheetAction_ in the Apps Script). */
export async function runSheetAction(action: SheetAction, extra: Record<string, unknown> = {}, fetchFn: Fetch = fetch): Promise<Record<string, unknown>> {
  return postToSheet<{ ok?: boolean; error?: string } & Record<string, unknown>>({ action, ...extra }, fetchFn);
}

/**
 * Stores per-extension totals for one or more days in the sheet's Daily Totals tab. A day uploaded again is replaced.
 * `source` is saved next to the rows ("daily", or a description of the period that was spread over its working days).
 */
export async function sendDailyToSheet(
  days: { date: string; rows: DailyTotalRow[] }[],
  source: string,
  fetchFn: Fetch = fetch,
): Promise<{ days: number; rows: number; replaced: number; newAgents: string[]; resolved?: string; protectedDays: number }> {
  const reply = await postToSheet<{ ok?: boolean; error?: string; days: number; rows: number; replaced: number; newAgents: string[]; resolved?: string; protectedRows?: number }>(
    { action: 'importDaily', days, source },
    fetchFn,
  );
  return { days: reply.days, rows: reply.rows, replaced: reply.replaced, newAgents: reply.newAgents ?? [], resolved: reply.resolved, protectedDays: reply.protectedRows ?? 0 };
}
