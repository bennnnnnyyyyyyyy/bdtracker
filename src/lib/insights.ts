import { OpenerStats } from '@/types/dashboard';
import { periodElapsed, periodDays, scaledTarget, Targets } from '@/lib/targets';

export interface AttentionItem {
  agent: string;
  severity: 'high' | 'medium';
  reasons: string[];
}

interface Context {
  targets: Targets | null;
  startDate: string;
  endDate: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Agents who are behind, with the reason(s), most urgent first. */
export function needsAttention(openers: OpenerStats[], ctx: Context): AttentionItem[] {
  const days = periodDays(ctx.startDate, ctx.endDate);
  const elapsed = periodElapsed(ctx.startDate, ctx.endDate);
  const items: AttentionItem[] = [];

  for (const o of openers) {
    const reasons: string[] = [];
    let severity: AttentionItem['severity'] = 'medium';

    if (o.calls === 0) {
      reasons.push('No calls logged');
      severity = 'high';
    } else if (o.presentDays > 0 && o.callsPerPresentDay < 10) {
      reasons.push(`Only ${o.callsPerPresentDay} calls per present day`);
    }

    const rated = o.attended + o.noShow;
    if (rated >= 3 && o.showRate < 0.4) {
      reasons.push(`Show rate ${pct(o.showRate)} (${o.attended} of ${rated})`);
      severity = 'high';
    }

    // Only judge against targets once enough of the period has passed for pace to mean something.
    if (ctx.targets && elapsed >= 0.3) {
      const checks: [string, number, number][] = [
        ['calls', o.calls, ctx.targets.calls],
        ['meetings booked', o.booked, ctx.targets.meetings],
        ['onboarded', o.onboarded, ctx.targets.onboarded],
      ];
      for (const [label, actual, weekly] of checks) {
        if (!weekly) continue;
        const expected = scaledTarget(weekly, days, 1) * elapsed;
        if (expected >= 2 && actual < expected * 0.6) {
          reasons.push(`${label}: ${actual} vs ~${Math.round(expected)} expected by now`);
        }
      }
    }

    if (reasons.length) items.push({ agent: o.opener, severity, reasons });
  }

  return items.sort((a, b) => (a.severity === b.severity ? b.reasons.length - a.reasons.length : a.severity === 'high' ? -1 : 1));
}

/** Best performers by closed deals, then meetings, then calls. */
export function topPerformers(openers: OpenerStats[], limit = 3): OpenerStats[] {
  return [...openers]
    .filter(o => o.calls > 0)
    .sort((a, b) => b.onboarded - a.onboarded || b.booked - a.booked || b.calls - a.calls)
    .slice(0, limit);
}
