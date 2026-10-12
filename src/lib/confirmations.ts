import { getSupabaseService } from './supabase';
import { CONFIG } from './config';
import type { ConfirmationInfo } from './meetings';
import type { MeetingRecord, ViewerInfo } from '../types/dashboard';

/** Loads every current show confirmation. Returns null when the store cannot be read. */
export async function loadConfirmations(): Promise<Map<string, ConfirmationInfo> | null> {
  const db = getSupabaseService();
  if (!db) return null;
  const map = new Map<string, ConfirmationInfo>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('show_confirmations')
      .select('meeting_key, confirmed_by_name, confirmed_at')
      .order('meeting_key')
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn('[Confirmations] read failed:', error.message);
      return null;
    }
    (data || []).forEach((r) => map.set(r.meeting_key, { confirmedBy: r.confirmed_by_name, confirmedAt: r.confirmed_at }));
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

/** Meetings that the one-time import should confirm: everything currently in a likely-show stage. */
export function initialImportCandidates(meetings: MeetingRecord[]): MeetingRecord[] {
  return meetings.filter((m) => m.showConfirmed !== true && CONFIG.LIKELY_SHOW_STAGES.includes(m.stage));
}
