// Client-safe stage rules (no environment access), shared by the server config and the UI.

/** Meetings in these stages can never be counted as shows. */
export const NEVER_SHOW_STAGES: readonly string[] = ['No-Show', 'Dead Leads'];

/**
 * Stages where a meeting most likely happened. Unconfirmed meetings here are reported as
 * "awaiting confirmation" so management can follow up. Any other stage can still be confirmed.
 */
export const LIKELY_SHOW_STAGES: readonly string[] = ['Follow Ups', 'Contract Sent', 'Invoice Sent', 'Onboarded', 'Temporary Inactive'];
