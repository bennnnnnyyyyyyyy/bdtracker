export const CONFIG = {
  // Call Dashboard Sheet (Call Logs, Import Staging, Agent Mapping, BD Dashboard)
  CALL_DASHBOARD_SHEET_ID: process.env.CALL_DASHBOARD_SHEET_ID || '1aI0879YxZdu17GHm-QLhOoE8CuFlkpyROvCtRjjuRbw',

  // BD Meetings Tracker Sheet (New Meetings, Follow Ups, etc.)
  BD_TRACKER_SHEET_ID: process.env.BD_TRACKER_SHEET_ID || '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8',

  // BD / French Dashboard 2026 Attendance Sheet
  ATTENDANCE_SHEET_ID: process.env.ATTENDANCE_SHEET_ID || '1OifBiymAAVSm8JNpIULtU7V4k_b_7Mj9Puo6Ag_suHw',
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

  OPENER_COL: 2, // Column B in each BD_TABS sheet (1-indexed for sheets, 0-indexed column 1)

  CALL_LOG_SHEET: 'Call Logs',
  STAGING_SHEET: 'Import Staging',
  MAPPING_SHEET: 'Agent Mapping',
  DASHBOARD_SHEET: 'BD Dashboard',

  RAW_HEADERS: [
    'Call Date',
    'Call ID',
    'From',
    'To',
    'Extension',
    'Department',
    'DID',
    'Description',
    'Type',
    'Outcome',
    'Duration',
    'Notes',
    'Call Path'
  ],
  CALL_LOG_EXTRA: ['Agent', 'Duration (sec)'],

  // Agents/Openers to completely exclude from dashboard
  EXCLUDED_AGENTS: ['russ', 'george', 'caroline', 'caroline richards']
};

/**
 * Checks if a given agent or opener name should be excluded from the dashboard.
 */
export function isExcludedAgent(name: string | null | undefined): boolean {
  if (!name) return false;
  const clean = name.trim().toLowerCase();
  if (!clean) return false;
  return CONFIG.EXCLUDED_AGENTS.some(excluded => clean === excluded || clean.startsWith(excluded) || clean.endsWith(excluded));
}

