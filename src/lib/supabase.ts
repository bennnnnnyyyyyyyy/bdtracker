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

/**
 * Ensures table data is saved in Supabase PostgreSQL in chunked batch inserts.
 */
export async function saveRawDataToSupabase(data: {
  calls: CallRecord[];
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
}): Promise<{ callsCount: number; meetingsCount: number; timestamp: string } | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    const timestamp = new Date().toISOString();

    // 1. Sync Agent Mappings
    if (data.agentMappings.length > 0) {
      const mappingsRows = data.agentMappings.map((m) => ({
        agent: m.agent,
        opener: m.opener,
        updated_at: timestamp,
      }));
      await supabase.from('agent_mappings').upsert(mappingsRows, { onConflict: 'agent' });
    }

    // 2. Sync Tracker Counts in metadata table
    await supabase.from('metadata').upsert({
      key: 'tracker_counts',
      value: data.trackerCounts,
      updated_at: timestamp,
    }, { onConflict: 'key' });

    // 3. Sync Meetings
    if (data.meetings.length > 0) {
      await supabase.from('meetings').delete().neq('id', 0);
      const meetingsRows = data.meetings.map((m) => ({
        stage: m.stage,
        opener: m.opener,
        date_added: m.dateAdded,
        company_name: m.companyName || '',
        authorized_person: m.authorizedPerson || '',
      }));

      const CHUNK_SIZE = 500;
      for (let i = 0; i < meetingsRows.length; i += CHUNK_SIZE) {
        const chunk = meetingsRows.slice(i, i + CHUNK_SIZE);
        await supabase.from('meetings').insert(chunk);
      }
    }

    // 4. Sync Calls
    await supabase.from('calls').delete().neq('id', 0);
    if (data.calls.length > 0) {
      const callsRows = data.calls.map((c, idx) => ({
        call_id: c.callId || `call_${idx}`,
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
      }));

      const CHUNK_SIZE = 1000;
      for (let i = 0; i < callsRows.length; i += CHUNK_SIZE) {
        const chunk = callsRows.slice(i, i + CHUNK_SIZE);
        await supabase.from('calls').upsert(chunk, { onConflict: 'call_id' });
      }
    }

    // 5. Update sync metadata
    await supabase.from('metadata').upsert({
      key: 'sync_status',
      value: {
        lastSynced: timestamp,
        totalCalls: data.calls.length,
        totalMeetings: data.meetings.length,
      },
      updated_at: timestamp,
    }, { onConflict: 'key' });

    return {
      callsCount: data.calls.length,
      meetingsCount: data.meetings.length,
      timestamp,
    };
  } catch (err) {
    console.warn('Error saving data to Supabase:', err);
    return null;
  }
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

    // Timeout after 3 seconds to prevent long hangs if Supabase is unreachable/cold
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));

    const fetchPromise = (async () => {
      // 1. Fetch metadata
      const { data: metaData, error: metaErr } = await supabase
        .from('metadata')
        .select('key, value, updated_at');

      if (metaErr || !metaData) return null;

      const syncMeta = metaData.find((m) => m.key === 'sync_status');
      const trackerMeta = metaData.find((m) => m.key === 'tracker_counts');

      if (!syncMeta) return null;

      const lastUpdated = syncMeta.updated_at || new Date().toISOString();
      const trackerCounts = (trackerMeta?.value as Record<string, Record<string, number>>) || {};

      // 2. Fetch mappings and meetings in parallel
      const [mappingsRes, meetingsRes] = await Promise.all([
        supabase.from('agent_mappings').select('agent, opener'),
        supabase.from('meetings').select('stage, opener, date_added, company_name, authorized_person'),
      ]);

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
      }));

      // 3. Fetch all calls
      let allCalls: CallRecord[] = [];
      let page = 0;
      const PAGE_SIZE = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: callsPage, error } = await supabase
          .from('calls')
          .select('*')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error || !callsPage || callsPage.length === 0) {
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

      if (allCalls.length === 0 && meetings.length === 0) {
        return null;
      }

      return {
        calls: allCalls,
        meetings,
        trackerCounts,
        agentMappings,
        lastUpdated,
      };
    })();

    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (error) {
    console.warn('Error fetching data from Supabase:', error);
    return null;
  }
}
