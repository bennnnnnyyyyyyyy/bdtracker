'use client';

import React from 'react';
import { DashboardResponse, FilterState, OrgTotals } from '@/types/dashboard';
import { formatPercent } from '@/lib/analytics';
import { AttentionItem } from '@/lib/insights';

interface Props {
  data: DashboardResponse;
  filters: FilterState;
  previous: OrgTotals | null;
  attention: AttentionItem[];
}

const th = 'text-left text-[10px] uppercase tracking-wider text-gray-500 font-semibold py-1.5 pr-3 border-b border-gray-300';
const thr = `${th} text-right`;
const td = 'py-1.5 pr-3 border-b border-gray-200';
const tdr = `${td} text-right tabular-nums`;

function change(curr: number, prev: number | undefined, kind: 'count' | 'rate'): string {
  if (prev === undefined || prev === 0) return '—';
  if (kind === 'rate') {
    const pts = Math.round((curr - prev) * 100);
    return `${pts > 0 ? '+' : ''}${pts} pts`;
  }
  const p = Math.round(((curr - prev) / prev) * 100);
  return `${p > 0 ? '+' : ''}${p}%`;
}

/** One-page summary shown only when printing / saving as PDF. */
export const PrintReport: React.FC<Props> = ({ data, filters, previous, attention }) => {
  const t = data.totals;
  const agents = data.openers.filter(o => o.opener && o.opener !== 'undefined').sort((a, b) => b.calls - a.calls);
  const kpis: { label: string; value: string; delta: string }[] = [
    { label: 'Calls', value: t.calls.toLocaleString(), delta: change(t.calls, previous?.calls, 'count') },
    { label: 'Answer rate', value: formatPercent(t.answerRate), delta: change(t.answerRate, previous?.answerRate, 'rate') },
    { label: 'Meetings booked', value: t.booked.toLocaleString(), delta: change(t.booked, previous?.booked, 'count') },
    { label: 'Show rate', value: formatPercent(t.showRate), delta: change(t.showRate, previous?.showRate, 'rate') },
    { label: 'Onboarded', value: t.onboarded.toLocaleString(), delta: change(t.onboarded, previous?.onboarded, 'count') },
    { label: 'Close rate', value: formatPercent(t.closeRate), delta: change(t.closeRate, previous?.closeRate, 'rate') },
  ];
  const funnel = [
    ['Calls', t.calls], ['Answered', t.answered], ['Meetings booked', t.booked], ['Attended', t.attended], ['Onboarded', t.onboarded],
  ] as const;

  return (
    <div className="print-report hidden print:block text-gray-900 text-[11px] leading-snug">
      <header className="flex items-end justify-between border-b-2 border-gray-900 pb-2 mb-4">
        <div>
          <h1 className="text-xl font-bold">BD Performance Report</h1>
          <p className="text-gray-600">
            {filters.startDate} → {filters.endDate}{filters.selectedOpener !== 'ALL' ? ` · ${filters.selectedOpener}` : ' · All agents'}
          </p>
        </div>
        <p className="text-gray-500 text-right">Generated {new Date().toLocaleString()}<br />Data as of {new Date(data.dataAsOf || data.lastUpdated).toLocaleString()}</p>
      </header>

      <section className="grid grid-cols-6 gap-3 mb-5">
        {kpis.map(k => (
          <div key={k.label} className="border border-gray-300 rounded p-2">
            <div className="text-[9px] uppercase tracking-wider text-gray-500">{k.label}</div>
            <div className="text-lg font-bold mt-0.5">{k.value}</div>
            <div className="text-gray-500">vs prev. period {k.delta}</div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-2 gap-6 mb-5">
        <section>
          <h2 className="font-bold text-xs mb-1.5">Conversion funnel</h2>
          <table className="w-full"><thead><tr><th className={th}>Stage</th><th className={thr}>Count</th><th className={thr}>% of calls</th></tr></thead>
            <tbody>{funnel.map(([label, v]) => (
              <tr key={label}><td className={td}>{label}</td><td className={tdr}>{v.toLocaleString()}</td><td className={tdr}>{t.calls ? `${((v / t.calls) * 100).toFixed(1)}%` : '—'}</td></tr>
            ))}</tbody></table>
        </section>
        <section>
          <h2 className="font-bold text-xs mb-1.5">Needs attention</h2>
          {attention.length === 0 ? <p className="text-gray-600">Everyone is on track for this period.</p> : (
            <ul className="space-y-1">{attention.slice(0, 6).map(a => (
              <li key={a.agent}><strong>{a.agent}</strong> <span className="text-gray-500">({a.severity === 'high' ? 'urgent' : 'watch'})</span>: {a.reasons.join('; ')}</li>
            ))}</ul>
          )}
        </section>
      </div>

      <section>
        <h2 className="font-bold text-xs mb-1.5">Agent summary</h2>
        <table className="w-full">
          <thead><tr>
            <th className={th}>Agent</th><th className={thr}>Calls</th><th className={thr}>Answer %</th><th className={thr}>Booked</th>
            <th className={thr}>Attended</th><th className={thr}>No-show</th><th className={thr}>Show %</th><th className={thr}>Onboarded</th><th className={thr}>Close %</th>
          </tr></thead>
          <tbody>
            {agents.map(o => (
              <tr key={o.opener}><td className={`${td} font-semibold`}>{o.opener}</td><td className={tdr}>{o.calls.toLocaleString()}</td><td className={tdr}>{formatPercent(o.answerRate)}</td>
                <td className={tdr}>{o.booked}</td><td className={tdr}>{o.attended}</td><td className={tdr}>{o.noShow}</td><td className={tdr}>{formatPercent(o.showRate)}</td>
                <td className={tdr}>{o.onboarded}</td><td className={tdr}>{formatPercent(o.closeRate)}</td></tr>
            ))}
            <tr className="font-bold"><td className={td}>Total</td><td className={tdr}>{t.calls.toLocaleString()}</td><td className={tdr}>{formatPercent(t.answerRate)}</td>
              <td className={tdr}>{t.booked}</td><td className={tdr}>{t.attended}</td><td className={tdr}>{t.noShow}</td><td className={tdr}>{formatPercent(t.showRate)}</td>
              <td className={tdr}>{t.onboarded}</td><td className={tdr}>{formatPercent(t.closeRate)}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
};
