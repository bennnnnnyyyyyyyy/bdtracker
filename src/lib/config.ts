export const CONFIG = {
  // Call Dashboard Sheet (Call Logs, Import Staging, Agent Mapping, BD Dashboard)
  CALL_DASHBOARD_SHEET_ID: process.env.CALL_DASHBOARD_SHEET_ID || '1aI0879YxZdu17GHm-QLhOoE8CuFlkpyROvCtRjjuRbw',

  // BD Meetings Tracker Sheet (New Meetings, Follow Ups, etc.)
  BD_TRACKER_SHEET_ID: process.env.BD_TRACKER_SHEET_ID || '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8',

  // Attendance is copied into the BD Tracker by the French Dashboard Apps Script bridge.
  ATTENDANCE_SHEET_ID: process.env.ATTENDANCE_SHEET_ID || '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8',
  ATTENDANCE_SHEET_NAME: 'Attendance',

  // Local fallback file names
  LOCAL_ATTENDANCE_FILE: 'BD _ French Dashboard 2026 (3).xlsx',
  LOCAL_ULTATEL_DEPT_FILE: 'OutBound Calls Per Department ( BusinessDevelopmentTeam ).xlsx',

  BD_TABS: [
    'New Meetings',
    'Follow Ups',
    'Contract Sent',
    'Invoice Sent',
    'Onboarded',
    'No-Show',
    'Dead Leads',
    'Temporary Inactive'
  ],

  // A record is treated as attended once it has progressed beyond the initial meeting
  // stage (including clients that later went Temporary Inactive). Pending records (New
  // Meetings) and Dead Leads are excluded from show-rate calculations instead of being
  // counted as attended by default. Keep in sync with apps-script/Code.js.
  ATTENDED_STAGES: ['Follow Ups', 'Contract Sent', 'Invoice Sent', 'Onboarded', 'Temporary Inactive'],

  CALL_LOG_SHEET: 'Call Logs',
  MAPPING_SHEET: 'Agent Mapping',

  // Agents/Openers to completely exclude from dashboard.
  // Keep in sync with CONFIG.EXCLUDED_AGENTS in apps-script/Code.js (which also owns the staging/dashboard tab names).
  EXCLUDED_AGENTS: ['russ', 'george', 'caroline', 'caroline richards']
};

function normalizeNameForMatch(name: string): string {
  return ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

/**
 * Checks if a given agent or opener name should be excluded from the dashboard.
 * Matches whole words only: "George Smith" and "112 (MMS-George)" are excluded, "Georgette" is not.
 */
export function isExcludedAgent(name: string | null | undefined): boolean {
  if (!name) return false;
  const normalized = normalizeNameForMatch(name);
  if (normalized.trim() === '') return false;
  return CONFIG.EXCLUDED_AGENTS.some(excluded => normalized.includes(normalizeNameForMatch(excluded)));
}
