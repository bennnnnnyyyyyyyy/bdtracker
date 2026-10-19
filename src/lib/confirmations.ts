import { getSupabaseService } from './supabase';
import type { ConfirmationInfo } from './meetings';
import type { MeetingRecord, ViewerInfo } from '../types/dashboard';

/** Loads every current show confirmation. Returns null when the store cannot be read. */
export async function loadConfirmations(): Promise<Map<string, ConfirmationInfo> | null> {
  const db = getSupabaseService();
  if (!db) return null;
  const map = new Map<string, ConfirmationInfo>();
  const PAGE = 1000;
  // Older databases lack the outcome / stage_override columns until the latest supabase_schema.sql is run.
  let columns = 'meeting_key, confirmed_by_name, confirmed_at, outcome, stage_override';
  for (let from = 0; ; from += PAGE) {
    let res = await db.from('show_confirmations').select(columns).order('meeting_key').range(from, from + PAGE - 1);
    if (res.error && columns.includes('outcome')) {
      columns = 'meeting_key, confirmed_by_name, confirmed_at';
      res = await db.from('show_confirmations').select(columns).order('meeting_key').range(from, from + PAGE - 1);
    }
    const { data, error } = res;
    if (error) {
      console.warn('[Confirmations] read failed:', error.message);
      return null;
    }
    ((data || []) as unknown as Array<{ meeting_key: string; confirmed_by_name: string; confirmed_at: string; outcome?: 'show' | 'no_show' | null; stage_override?: string | null }>).forEach((r) =>
      map.set(r.meeting_key, { confirmedBy: r.confirmed_by_name, confirmedAt: r.confirmed_at, outcome: r.outcome === undefined ? 'show' : r.outcome, stageOverride: r.stage_override ?? null }));
    if (!data || data.length < PAGE) break;
  }
  return map;
}

function assertOk(res: { error: { message: string } | null }, step: string): void {
  if (res.error) throw new Error(`${step} failed: ${res.error.message}`);
}

/**
 * Confirms or revokes shows for the given meetings (already validated against live data).
 * Every change is also appended to show_confirmation_events as an audit trail.
 */
export async function applyConfirmations(
  action: 'confirm' | 'revoke',
  meetings: MeetingRecord[],
  user: ViewerInfo,
  source: 'manual' | 'initial-import' = 'manual'
): Promise<number> {
  const db = getSupabaseService();
  if (!db) throw new Error('Confirmations need SUPABASE_SERVICE_ROLE_KEY to be configured.');
  const now = new Date().toISOString();
  const keys = meetings.map((m) => m.meetingKey as string);
  if (keys.length === 0) return 0;

  if (action === 'confirm') {
    const rows = meetings.map((m) => ({
      meeting_key: m.meetingKey, opener: m.opener, company_name: m.companyName || '', authorized_person: m.authorizedPerson || '',
      date_added: m.dateAdded || '', stage_at_confirmation: m.stage,
      confirmed_by_id: user.id === 'dev' ? null : user.id, confirmed_by_name: user.name, confirmed_by_email: user.email,
      confirmed_at: now, source,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      assertOk(await db.from('show_confirmations').upsert(rows.slice(i, i + 500), { onConflict: 'meeting_key' }), 'Saving confirmations');
    }
  } else {
    for (let i = 0; i < keys.length; i += 200) {
      assertOk(await db.from('show_confirmations').delete().in('meeting_key', keys.slice(i, i + 200)), 'Removing confirmations');
    }
  }

  const events = meetings.map((m) => ({
    meeting_key: m.meetingKey, action, user_id: user.id === 'dev' ? null : user.id, user_name: user.name, user_email: user.email,
    stage: m.stage, source, at: now,
  }));
  for (let i = 0; i < events.length; i += 500) {
    assertOk(await db.from('show_confirmation_events').insert(events.slice(i, i + 500)), 'Writing audit log');
  }
  return keys.length;
}

/**
 * A tracker row was edited (opener, date, company or contact), which changes its key. Re-keys the stored
 * confirmation / reschedule marker so it follows the row. Failures are logged only: the in-memory match still applies.
 */
export async function renameStoredKeys(table: 'show_confirmations' | 'rescheduled_meetings', renames: Array<[string, string]>): Promise<void> {
  const db = getSupabaseService();
  if (!db) return;
  for (const [from, to] of renames) {
    const { error } = await db.from(table).update({ meeting_key: to }).eq('meeting_key', from);
    if (error) console.warn(`[${table}] could not re-key an edited row:`, error.message);
  }
}

export interface Decision {
  meeting: MeetingRecord;
  /** The decision to store; both null removes it. */
  outcome: 'show' | 'no_show' | null;
  stage: string | null;
}

/** Saves manager decisions (show / no-show / stage change, or clears them). Every change is audited. */
export async function applyDecisions(decisions: Decision[], user: ViewerInfo): Promise<number> {
  const db = getSupabaseService();
  if (!db) throw new Error('Confirmations need SUPABASE_SERVICE_ROLE_KEY to be configured.');
  if (decisions.length === 0) return 0;
  const now = new Date().toISOString();
  const keep = decisions.filter((d) => d.outcome || d.stage);
  const clear = decisions.filter((d) => !d.outcome && !d.stage);

  const rows = keep.map(({ meeting: m, outcome, stage }) => ({
    meeting_key: m.meetingKey, opener: m.opener, company_name: m.companyName || '', authorized_person: m.authorizedPerson || '',
    date_added: m.dateAdded || '', stage_at_confirmation: m.sheetStage || m.stage, outcome, stage_override: stage,
    confirmed_by_id: user.id === 'dev' ? null : user.id, confirmed_by_name: user.name, confirmed_by_email: user.email,
    confirmed_at: now, source: 'manual',
  }));
  for (let i = 0; i < rows.length; i += 500) {
    assertOk(await db.from('show_confirmations').upsert(rows.slice(i, i + 500), { onConflict: 'meeting_key' }), 'Saving decisions');
  }
  const clearKeys = clear.map((d) => d.meeting.meetingKey as string);
  for (let i = 0; i < clearKeys.length; i += 200) {
    assertOk(await db.from('show_confirmations').delete().in('meeting_key', clearKeys.slice(i, i + 200)), 'Removing decisions');
  }

  const events = decisions.map(({ meeting: m, outcome, stage }) => ({
    meeting_key: m.meetingKey, action: !outcome && !stage ? 'revoke' : outcome === 'show' && !stage ? 'confirm' : 'set',
    user_id: user.id === 'dev' ? null : user.id, user_name: user.name, user_email: user.email,
    stage: stage || m.sheetStage || m.stage, source: outcome ? `outcome:${outcome}` : 'stage-change', at: now,
  }));
  for (let i = 0; i < events.length; i += 500) {
    assertOk(await db.from('show_confirmation_events').insert(events.slice(i, i + 500)), 'Writing audit log');
  }
  return decisions.length;
}
