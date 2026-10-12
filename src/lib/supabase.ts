import { createClient } from '@supabase/supabase-js';
import { CallRecord, MeetingRecord, AgentMapping } from '../types/dashboard';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tyideivywfxxvqbfdxag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function getSupabaseAdmin() {
  try {
    if (!SUPABASE_KEY) {
      return null;
    }
    return createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
    return null;
  }
}

function assertOk(res: { error: { message: string } | null }, step: string): void {
  if (res.error) throw new Error(`Supabase ${step} failed: ${res.error.message}`);
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || /med_b|ppo/i.test(error.message || '');
}

/**
 * Saves a snapshot of the source data to Supabase PostgreSQL.
 *
 * Safety rules:
 * - Refuses to run with empty calls or meetings so a failed source pull can never wipe the snapshot.
 * - New rows are written before old rows are removed, so a failure leaves the previous snapshot intact.
 * - Every Supabase response is checked; any failure throws.
 *
 * Returns null when Supabase is not configured.
 */
export async function saveRawDataToSupabase(data: {
  calls: CallRecord[];
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
}): Promise<{ callsCount: number; meetingsCount: number; timestamp: string; warnings: string[] } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  if (data.calls.length === 0 || data.meetings.length === 0) {
    throw new Error(
      `Refusing to overwrite the Supabase snapshot with incomplete data (calls: ${data.calls.length}, meetings: ${data.meetings.length}).`
    );
  }

  const timestamp = new Date().toISOString();
  const warnings: string[] = [];

  // 1. Agent mappings
  if (data.agentMappings.length > 0) {
    const mappingsRows = data.agentMappings.map((m) => ({
      agent: m.agent,
      opener: m.opener,
      updated_at: timestamp,
    }));
    assertOk(await supabase.from('agent_mappings').upsert(mappingsRows, { onConflict: 'agent' }), 'agent_mappings upsert');
  }

  // 2. Tracker counts
  assertOk(
    await supabase.from('metadata').upsert({ key: 'tracker_counts', value: data.trackerCounts, updated_at: timestamp }, { onConflict: 'key' }),
    'tracker_counts upsert'
  );

  // 3. Meetings: insert the new snapshot first, then remove the rows that existed before.
  const prev = await supabase.from('meetings').select('id').order('id', { ascending: false }).limit(1);
  assertOk(prev, 'meetings read');
  const previousMaxId: number = prev.data?.[0]?.id ?? 0;

  const buildMeetingRow = (m: MeetingRecord, withFlags: boolean) => ({
    stage: m.stage,
    opener: m.opener,
    date_added: m.dateAdded,
    company_name: m.companyName || '',
    authorized_person: m.authorizedPerson || '',
    ...(withFlags ? { med_b: Boolean(m.medB), ppo: Boolean(m.ppo) } : {}),
  });

  let withFlags = true;
  const MEETING_CHUNK = 500;
  try {
    for (let i = 0; i < data.meetings.length; i += MEETING_CHUNK) {
      const chunk = data.meetings.slice(i, i + MEETING_CHUNK);
      let res = await supabase.from('meetings').insert(chunk.map((m) => buildMeetingRow(m, withFlags)));
      if (res.error && withFlags && isMissingColumnError(res.error)) {
        // Schema predates the med_b / ppo columns; keep syncing without them.
        withFlags = false;
        warnings.push('meetings.med_b / meetings.ppo columns missing: run the migration in supabase_schema.sql so Med B / PPO survive a fallback.');
        res = await supabase.from('meetings').insert(chunk.map((m) => buildMeetingRow(m, false)));
      }
      assertOk(res, 'meetings insert');
    }
  } catch (err) {
    // Roll back the partial new snapshot; the previous one is still in place.
    await supabase.from('meetings').delete().gt('id', previousMaxId);
    throw err;
  }
  assertOk(await supabase.from('meetings').delete().lte('id', previousMaxId), 'old meetings cleanup');

  // 4. Calls: upsert everything (deduplicated by call_id), then drop rows not seen in this sync.
  const callsById = new Map<string, Record<string, unknown>>();
  data.calls.forEach((c, idx) => {
    const callId = c.callId || `call_${idx}`;
    callsById.set(callId, {
      call_id: callId,
      call_date: c.callDate,
      from_num: c.from,
      to_num: c.to,
      extension: c.extension,
      department: c.department,
      did: c.did,
      description: c.description,
      call_type: c.type,
      outcome: c.outcome,
      duration: c.duration,
      duration_sec: c.durationSec,
      notes: c.notes,
      call_path: c.callPath,
      agent: c.agent,
      opener: c.opener,
      updated_at: timestamp,
    });
  });
  const callsRows = Array.from(callsById.values());
  const CALL_CHUNK = 1000;
  for (let i = 0; i < callsRows.length; i += CALL_CHUNK) {
    assertOk(await supabase.from('calls').upsert(callsRows.slice(i, i + CALL_CHUNK), { onConflict: 'call_id' }), 'calls upsert');
  }
  assertOk(await supabase.from('calls').delete().lt('updated_at', timestamp), 'stale calls cleanup');

  // 5. Sync status last: its presence marks the snapshot as complete.
  assertOk(
    await supabase.from('metadata').upsert(
      {
        key: 'sync_status',
        value: { lastSynced: timestamp, totalCalls: callsRows.length, totalMeetings: data.meetings.length },
        updated_at: timestamp,
      },
      { onConflict: 'key' }
    ),
    'sync_status upsert'
  );

  return { callsCount: callsRows.length, meetingsCount: data.meetings.length, timestamp, warnings };
}

/**
 * Reads raw records from Supabase PostgreSQL tables with a fast timeout fallback.
 */
export async function getRawDataFromSupabase(): Promise<{
  calls: CallRecord[];
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
  lastUpdated: string;
} | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    // Allow the paginated raw-data read to complete without masking it as a timeout
    // On timeout, abort the in-flight queries as well so they do not keep running.
    const controller = new AbortController();
    const signal = controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, 15000);
    });

    const fetchPromise = (async () => {
      // 1. Fetch metadata
      const { data: metaData, error: metaErr } = await supabase
        .from('metadata')
        .select('key, value, updated_at')
        .abortSignal(signal);

      if (metaErr || !metaData) return null;

      const syncMeta = metaData.find((m) => m.key === 'sync_status');
      const trackerMeta = metaData.find((m) => m.key === 'tracker_counts');

      if (!syncMeta) return null;

      const lastUpdated = syncMeta.updated_at || new Date().toISOString();
      const trackerCounts = (trackerMeta?.value as Record<string, Record<string, number>>) || {};

      // 2. Fetch all mappings and meetings. Source-sheet dates are stored as text
      // in multiple formats, so SQL text comparisons against ISO dates are incorrect.
      // Date filtering happens consistently in computeDashboardMetrics().
      const MEETING_COLUMNS = 'stage, opener, date_added, company_name, authorized_person';
      const [mappingsRes, meetingsWithFlags] = await Promise.all([
        supabase.from('agent_mappings').select('agent, opener').abortSignal(signal),
        supabase.from('meetings').select(`${MEETING_COLUMNS}, med_b, ppo`).abortSignal(signal),
      ]);
      // Older schemas have no med_b / ppo columns.
      const meetingsRes = meetingsWithFlags.error && isMissingColumnError(meetingsWithFlags.error)
        ? await supabase.from('meetings').select(MEETING_COLUMNS).abortSignal(signal)
        : meetingsWithFlags;
      // A failed read must not be mistaken for an empty snapshot.
      if (mappingsRes.error || meetingsRes.error) return null;

      const agentMappings: AgentMapping[] = (mappingsRes.data || []).map((m) => ({
        agent: m.agent,
        opener: m.opener,
      }));

      const meetings: MeetingRecord[] = (meetingsRes.data || []).map((m) => ({
        stage: m.stage,
        opener: m.opener,
        dateAdded: m.date_added,
        companyName: m.company_name,
        authorizedPerson: m.authorized_person,
        medB: Boolean((m as { med_b?: boolean }).med_b),
        ppo: Boolean((m as { ppo?: boolean }).ppo),
      }));

      // 3. Fetch all calls
      let allCalls: CallRecord[] = [];
      let page = 0;
      const PAGE_SIZE = 1000;
      let hasMore = true;

      while (hasMore) {
        // call_date is source-sheet text (not an ISO database date); fetch it
        // unfiltered and let computeDashboardMetrics() parse/filter it.
        const callsQuery = supabase.from('calls').select(
          'call_date, call_id, from_num, to_num, extension, department, did, description, call_type, outcome, duration, duration_sec, notes, call_path, agent, opener'
        );
        const { data: callsPage, error } = await callsQuery
          .order('call_id')
          .abortSignal(signal)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) return null; // never serve a silently truncated call history
        if (!callsPage || callsPage.length === 0) {
          hasMore = false;
          break;
        }

        const mapped: CallRecord[] = callsPage.map((c) => ({
          callDate: c.call_date,
          callId: c.call_id,
          from: c.from_num,
          to: c.to_num,
          extension: c.extension,
          department: c.department,
          did: c.did,
          description: c.description,
          type: c.call_type,
          outcome: c.outcome,
          duration: c.duration,
          durationSec: c.duration_sec,
          notes: c.notes,
          callPath: c.call_path,
          agent: c.agent,
          opener: c.opener,
        }));

        allCalls = allCalls.concat(mapped);
        if (callsPage.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          page++;
        }
      }

      return {
        calls: allCalls,
        meetings,
        trackerCounts,
        agentMappings,
        lastUpdated,
      };
    })();

    try {
      return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (error) {
    console.warn('Error fetching data from Supabase:', error);
    return null;
  }
}
