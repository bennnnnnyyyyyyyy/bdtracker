import { CONFIRMATION_QUEUE_STAGE, CONFIRMATION_START_DATE, LIKELY_SHOW_STAGES, NEVER_SHOW_STAGES } from './stages';

export const CONFIG = {
  // Call Dashboard Sheet (Daily Totals, Totals, Call Logs, Agent Mapping, BD Dashboard)
  CALL_DASHBOARD_SHEET_ID: process.env.CALL_DASHBOARD_SHEET_ID || '1aI0879YxZdu17GHm-QLhOoE8CuFlkpyROvCtRjjuRbw',

  // BD Meetings Tracker Sheet (New Meetings, Follow Ups, etc.)
  BD_TRACKER_SHEET_ID: process.env.BD_TRACKER_SHEET_ID || '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8',

  // The BD French attendance workbook (tab "Attendance"). Override with the ATTENDANCE_SHEET_ID environment variable.
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
    'Temporary Inactive',
    'DISQUALIFIED',
    'CANCELLED'
  ],

  // A meeting counts as a show only after management confirms it in the dashboard.
  // Stage rules live in ./stages (client-safe); keep apps-script/Code.js in mind when changing them.
  NEVER_SHOW_STAGES,
  LIKELY_SHOW_STAGES,
  CONFIRMATION_START_DATE,
  CONFIRMATION_QUEUE_STAGE,

  DAILY_TOTALS_SHEET: 'Daily Totals',
  ACTIVITY_LOG_SHEET: '_Activity_Log',
  CALL_LOG_SHEET: 'Call Logs',
  MAPPING_SHEET: 'Agent Mapping',

  // Agents/Openers to completely exclude from dashboard.
  // Keep in sync with CONFIG.EXCLUDED_AGENTS in apps-script/Code.js (which also owns the dashboard tab names).
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
