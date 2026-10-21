'use client';

import React from 'react';
import { AlertTriangle, Award, CheckCircle2 } from 'lucide-react';
import { OpenerStats } from '@/types/dashboard';
import { AttentionItem, topPerformers } from '@/lib/insights';

interface Props {
  openers: OpenerStats[];
  attention: AttentionItem[];
  targetsSet: boolean;
}

export const AttentionPanel: React.FC<Props> = React.memo(({ openers, attention, targetsSet }) => {
  const top = topPerformers(openers);
  return (
    <section aria-labelledby="attention-heading" className="card p-5 flex flex-col gap-5">
      <div>
        <h3 id="attention-heading" className="font-serif text-base font-bold text-white flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warn" aria-hidden="true" />Needs attention
        </h3>
        {attention.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-success"><CheckCircle2 className="w-4 h-4" aria-hidden="true" />Everyone is on track for this period.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {attention.slice(0, 5).map(item => (
              <li key={item.agent} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{item.agent}</span>
                  <span className={`pill ${item.severity === 'high' ? 'pill-danger' : 'pill-warn'}`}>{item.severity === 'high' ? 'Urgent' : 'Watch'}</span>
                </div>
                <ul className="mt-1 text-xs text-text-muted list-disc pl-4 space-y-0.5">
                  {item.reasons.map(r => <li key={r}>{r}</li>)}
                </ul>
              </li>
            ))}
            {attention.length > 5 && <li className="text-xs text-text-dim">+ {attention.length - 5} more in the Team tab</li>}
          </ul>
        )}
        {!targetsSet && <p className="mt-3 text-xs text-text-dim">Set targets (Actions → Targets) to also flag agents who are behind pace.</p>}
      </div>

      {top.length > 0 && (
        <div className="border-t border-white/7 pt-4">
          <h3 className="font-serif text-base font-bold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-gold-light" aria-hidden="true" />Top performers
          </h3>
          <ol className="mt-3 space-y-2">
            {top.map((o, i) => (
              <li key={o.opener} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-primary"><span className="text-text-dim font-num mr-2">{i + 1}</span>{o.opener}</span>
                <span className="font-num text-xs text-text-muted">{o.onboarded} closed · {o.booked} booked · {o.calls.toLocaleString()} calls</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
});

AttentionPanel.displayName = 'AttentionPanel';
