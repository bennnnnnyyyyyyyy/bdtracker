'use client';

import React from 'react';
import { OrgTotals } from '@/types/dashboard';

interface Step {
  label: string;
  value: number;
  note?: string;
}

function pctOf(value: number, base: number): string {
  if (!base) return '—';
  const p = (value / base) * 100;
  return `${p >= 10 ? Math.round(p) : p.toFixed(1)}%`;
}

export const FunnelChart: React.FC<{ totals: OrgTotals }> = React.memo(({ totals }) => {
  const steps: Step[] = [
    { label: 'Calls', value: totals.calls },
    { label: 'Answered', value: totals.answered },
    { label: 'Meetings booked', value: totals.booked },
    { label: 'Attended', value: totals.attended },
    { label: 'Onboarded', value: totals.onboarded },
  ];
  const max = Math.max(1, steps[0].value);

  return (
    <section aria-labelledby="funnel-heading" className="card p-5">
      <div className="mb-4">
        <h3 id="funnel-heading" className="font-serif text-base font-bold text-white">Conversion funnel</h3>
        <p className="text-xs text-text-dim mt-0.5">From calls to closed deals. Percentages show the step from the stage before, with the overall share of calls on the right.</p>
      </div>
      <ol className="space-y-3">
        {steps.map((step, i) => {
          const prev = i === 0 ? null : steps[i - 1].value;
          const width = Math.max(step.value > 0 ? 3 : 0, (step.value / max) * 100);
          return (
            <li key={step.label} className="grid grid-cols-[7.5rem_1fr_auto] sm:grid-cols-[9rem_1fr_9rem] items-center gap-3">
              <span className="text-sm text-text-muted">{step.label}</span>
              <div className="bar-track !h-6 !rounded-md" role="img" aria-label={`${step.label}: ${step.value.toLocaleString()}`}>
                <div className={`bar-fill !rounded-md ${i === steps.length - 1 ? 'bar-fill-success' : 'bar-fill-gold'}`} style={{ width: `${width}%` }} />
              </div>
              <span className="font-num text-sm text-right">
                <strong className="text-white">{step.value.toLocaleString()}</strong>
                <span className="text-text-dim ml-2 text-xs">
                  {prev !== null ? `${pctOf(step.value, prev)} · ` : ''}{i === 0 ? '100%' : pctOf(step.value, steps[0].value)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
});

FunnelChart.displayName = 'FunnelChart';
