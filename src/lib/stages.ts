// Client-safe stage rules (no environment access), shared by the server config and the UI.

/** Meetings in these stages can never be counted as shows. */
export const NEVER_SHOW_STAGES: readonly string[] = ['No-Show', 'Dead Leads'];

/**
 * Stages where a meeting most likely happened. Unconfirmed meetings here are reported as
 * "awaiting confirmation" so management can follow up. Any other stage can still be confirmed.
 */
export const LIKELY_SHOW_STAGES: readonly string[] = ['Follow Ups', 'Contract Sent', 'Invoice Sent', 'Onboarded', 'Temporary Inactive'];

/**
 * Meetings added before this day (Date Added) are counted by the tab they sit in: every tab except No-Show (and
 * Dead Leads for shows) counts as a meeting and, in a show stage, as a show. From this day on a show needs
 * management confirmation in the dashboard.
 */
export const CONFIRMATION_START_DATE = '2026-10-12';

/** New meetings waiting to be confirmed are the ones that reached this tab. */
export const CONFIRMATION_QUEUE_STAGE = 'Follow Ups';
