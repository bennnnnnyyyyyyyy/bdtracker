import { OpenerStats } from '@/types/dashboard';

/** Weekly goals, per agent (qualified shows are a MONTHLY goal per agent). Team goals are the sum over the agents in view. */
export interface Targets {
  calls: number;
  meetings: number;
  onboarded: number;
  /** Qualified shows per agent, per calendar month. */
  qualifiedShows?: number;
}

const TARGETS_KEY = 'bd-tracker-targets-v1';

export function loadTargets(): Targets | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TARGETS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Targets>;
    const t = { calls: Number(parsed.calls) || 0, meetings: Number(parsed.meetings) || 0, onboarded: Number(parsed.onboarded) || 0, qualifiedShows: Number(parsed.qualifiedShows) || 0 };
    return t.calls || t.meetings || t.onboarded || t.qualifiedShows ? t : null;
  } catch {
    return null;
  }
}

export function saveTargets(targets: Targets | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (targets) window.localStorage.setItem(TARGETS_KEY, JSON.stringify(targets));
    else window.localStorage.removeItem(TARGETS_KEY);
  } catch {
    // Storage can be blocked (private mode); targets simply won't persist.
  }
}

function parseYmd(v: string): Date {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function periodDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 7;
  const days = Math.round((parseYmd(endDate).getTime() - parseYmd(startDate).getTime()) / 86400000) + 1;
  return Number.isFinite(days) && days > 0 ? days : 7;
}

/** Goal for the whole selected period: weekly per-agent goal scaled by period length and agent count. */
export function scaledTarget(perAgentWeek: number, days: number, agents: number): number {
  return Math.round((perAgentWeek * days * Math.max(1, agents)) / 7);
}

/**
 * Goal for the selected dates from a MONTHLY per-agent goal: the daily share of the month containing the end date,
 * times the days selected. A full calendar month gives exactly the monthly goal.
 */
export function monthlyTargetForPeriod(perAgentMonth: number, startDate: string, endDate: string): number {
  const days = periodDays(startDate, endDate);
  const end = endDate ? parseYmd(endDate) : new Date();
  const monthDays = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  return Math.max(1, Math.round((perAgentMonth * days) / monthDays));
}

/** How far through the selected period we are (0–1); 1 once the period is over. */
export function periodElapsed(startDate: string, endDate: string, now = new Date()): number {
  if (!startDate || !endDate) return 1;
  const start = parseYmd(startDate).getTime();
  const days = periodDays(startDate, endDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const elapsed = Math.round((today - start) / 86400000) + 1;
  return Math.min(1, Math.max(0, elapsed / days));
}

export function activeAgents(openers: OpenerStats[]): OpenerStats[] {
  return openers.filter(o => o.opener && o.opener !== 'undefined');
}
