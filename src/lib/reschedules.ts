import { getSupabaseService } from './supabase';
import type { MeetingRecord } from '../types/dashboard';

/**
 * A rescheduled meeting is booked before the confirmation start date but held after it. The tracker's Status column
 * only says "Rescheduled" while the meeting is waiting, so the dashboard remembers every meeting it has seen with
 * that status; from then on the meeting follows the confirmation rules (it needs confirming once it is held).
 */
const TTL_MS = 30_000;
let cache: { keys: Set<string>; at: number } | null = null;
const written = new Set<string>();

/** Keys of meetings remembered as rescheduled. Null when the store cannot be read (the status alone is then used). */
export async function loadRescheduledKeys(): Promise<Set<string> | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.keys;
  const db = getSupabaseService();
  if (!db) return null;
  const keys = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('rescheduled_meetings').select('meeting_key').order('meeting_key').range(from, from + PAGE - 1);
    if (error) {
      console.warn('[Reschedules] read failed (run the latest supabase_schema.sql):', error.message);
      return null;
    }
    (data || []).forEach((r) => keys.add(r.meeting_key));
    if (!data || data.length < PAGE) break;
  }
  cache = { keys, at: Date.now() };
  return keys;
}

/** Remembers meetings seen with a Rescheduled status. Safe to call on every load: only new keys are written. */
export async function rememberRescheduled(meetings: MeetingRecord[]): Promise<void> {
  const db = getSupabaseService();
  if (!db) return;
  const fresh = meetings.filter((m) => m.meetingKey && !written.has(m.meetingKey));
  if (fresh.length === 0) return;
  const rows = fresh.map((m) => ({ meeting_key: m.meetingKey, opener: m.opener, company_name: m.companyName || '', date_added: m.dateAdded || '' }));
  const { error } = await db.from('rescheduled_meetings').upsert(rows, { onConflict: 'meeting_key', ignoreDuplicates: true });
  if (error) {
    console.warn('[Reschedules] write failed:', error.message);
    return;
  }
  fresh.forEach((m) => written.add(m.meetingKey as string));
  cache = null;
}
