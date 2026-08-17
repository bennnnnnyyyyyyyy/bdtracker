export const CONFIG = {
  // Call Dashboard Sheet (Call Logs, Import Staging, Agent Mapping, BD Dashboard)
  CALL_DASHBOARD_SHEET_ID: process.env.CALL_DASHBOARD_SHEET_ID || '1aI0879YxZdu17GHm-QLhOoE8CuFlkpyROvCtRjjuRbw',

  // BD Meetings Tracker Sheet (New Meetings, Follow Ups, etc.)
  BD_TRACKER_SHEET_ID: process.env.BD_TRACKER_SHEET_ID || '1uicpBruuFeno2ES4hNw-TIAwNkGEI37gw8Z-A4yMpC8',

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
  CALL_LOG_EXTRA: ['Agent', 'Duration (sec)']
};
