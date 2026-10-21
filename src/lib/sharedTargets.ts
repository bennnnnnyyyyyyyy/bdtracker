import { getSupabaseService } from './supabase';
import type { Targets } from './targets';

const KEY = 'targets';

function clean(raw: unknown): Targets | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => Math.min(1_000_000, Math.max(0, Math.round(Number(v) || 0)));
  const t: Targets = { calls: n(r.calls), meetings: n(r.meetings), onboarded: n(r.onboarded), qualifiedShows: n(r.qualifiedShows) };
  return t.calls || t.meetings || t.onboarded || t.qualifiedShows ? t : null;
}

/** The targets every manager shares. `undefined` means the store cannot be read (the browser's own copy is used instead). */
export async function loadSharedTargets(): Promise<Targets | null | undefined> {
  const db = getSupabaseService();
  if (!db) return undefined;
  const { data, error } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle();
  if (error) {
    console.warn('[Targets] read failed (run the latest supabase_schema.sql):', error.message);
    return undefined;
  }
  return data ? clean(data.value) : null;
}

export async function saveSharedTargets(targets: unknown, by: string): Promise<Targets | null> {
  const db = getSupabaseService();
  if (!db) throw new Error('Shared targets need SUPABASE_SERVICE_ROLE_KEY to be configured.');
  const value = clean(targets);
  const { error } = value
    ? await db.from('app_settings').upsert({ key: KEY, value, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    : await db.from('app_settings').delete().eq('key', KEY);
  if (error) throw new Error(`Saving targets failed: ${error.message}`);
  return value;
}
