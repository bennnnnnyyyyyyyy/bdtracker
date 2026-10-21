import { getSupabaseService } from './supabase';

/** Agents who have left, by lower-case opener -> last day worked (yyyy-MM-dd). Null when the store cannot be read. */
let cache: { value: Record<string, string>; at: number } | null = null;
const TTL_MS = 15_000;

/** `fresh` skips the short cache (the Manage agents window must show a change made on another server instance). */
export async function loadRetirements(opts: { fresh?: boolean } = {}): Promise<Record<string, string> | null> {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const db = getSupabaseService();
  if (!db) return null;
  const { data, error } = await db.from('agent_retirements').select('opener_key, last_day');
  if (error) {
    console.warn('[Retirements] read failed (run the latest supabase_schema.sql):', error.message);
    return null;
  }
  const out: Record<string, string> = {};
  (data || []).forEach((r) => { out[r.opener_key] = r.last_day; });
  cache = { value: out, at: Date.now() };
  return out;
}

export async function setRetirement(opener: string, lastDay: string, by: string): Promise<void> {
  const db = getSupabaseService();
  if (!db) throw new Error('Managing agents needs SUPABASE_SERVICE_ROLE_KEY to be configured.');
  const { error } = await db.from('agent_retirements').upsert(
    { opener_key: opener.toLowerCase(), opener, last_day: lastDay, set_by: by, set_at: new Date().toISOString() },
    { onConflict: 'opener_key' }
  );
  if (error) throw new Error(`Saving failed: ${error.message}`);
  cache = null;
}

export async function clearRetirement(opener: string): Promise<void> {
  const db = getSupabaseService();
  if (!db) throw new Error('Managing agents needs SUPABASE_SERVICE_ROLE_KEY to be configured.');
  const { error } = await db.from('agent_retirements').delete().eq('opener_key', opener.toLowerCase());
  if (error) throw new Error(`Saving failed: ${error.message}`);
  cache = null;
}
