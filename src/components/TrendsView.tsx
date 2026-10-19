'use client';

import React, { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PeriodicGroupSummary } from '@/types/dashboard';
import { PeriodicBreakdownTable } from './PeriodicBreakdownTable';

export type PeriodView = 'daily' | 'weekly' | 'monthly';
const VIEWS: { id: PeriodView; label: string; noun: string }[] = [
  { id: 'daily', label: 'Daily', noun: 'day' },
  { id: 'weekly', label: 'Weekly', noun: 'week' },
  { id: 'monthly', label: 'Monthly', noun: 'month' },
];

const MAX_POINTS = 31;

function delta(curr: number, prev?: number): { text: string; dir: 'up' | 'down' | 'flat' } | null {
  if (prev === undefined || prev === 0) return null;
  const pct = Math.round(((curr - prev) / prev) * 100);
  return { text: `${Math.abs(pct)}%`, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

function Stat({ label, value, sub, change }: { label: string; value: string; sub: string; change: ReturnType<typeof delta> }) {
  return (
    <div className="card p-4">
      <div className="label-caps">{label}</div>
      <div className="flex items-baseline justify-between gap-2 mt-1">
        <strong className="font-num text-2xl text-white leading-none">{value}</strong>
        {change && (
          <span className={`font-num text-xs font-bold ${change.dir === 'up' ? 'text-success' : change.dir === 'down' ? 'text-danger' : 'text-text-dim'}`} title="Compared with the previous period">
            {change.dir === 'up' ? '▲' : change.dir === 'down' ? '▼' : '●'} {change.text}
          </span>
        )}
      </div>
      <div className="text-[11px] text-text-dim mt-1.5">{sub}</div>
    </div>
  );
}

export const TrendsView: React.FC<{
  daily: PeriodicGroupSummary[];
  weekly: PeriodicGroupSummary[];
  monthly: PeriodicGroupSummary[];
  view: PeriodView;
  onViewChange: (v: PeriodView) => void;
}> = ({ daily, weekly, monthly, view, onViewChange }) => {
  const data = view === 'daily' ? daily : view === 'weekly' ? weekly : monthly;
  const noun = VIEWS.find((v) => v.id === view)?.noun ?? 'period';

  // Data arrives newest first; the chart reads left to right in time.
  const chartData = useMemo(() => [...data].sort((a, b) => a.periodKey.localeCompare(b.periodKey)).slice(-MAX_POINTS).map((d) => ({
    period: d.periodLabel, Calls: d.totals.calls, 'Meetings booked': d.totals.meetings, Closed: d.totals.onboarded,
  })), [data]);

  const latest = data[0];
  const previous = data[1];
  const totalCalls = data.reduce((n, d) => n + d.totals.calls, 0);

  return (
    <section className="space-y-4" aria-labelledby="trends-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sec-tag mb-1">Trends</p>
          <h2 id="trends-heading" className="font-serif text-xl font-bold text-white">{VIEWS.find((v) => v.id === view)?.label} performance</h2>
          <p className="text-xs text-text-dim mt-1">{data.length} {noun}{data.length === 1 ? '' : 's'} in the selected dates · {totalCalls.toLocaleString()} calls</p>
        </div>
        <div className="seg" role="group" aria-label="Period granularity">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className="seg-item" aria-pressed={view === v.id} onClick={() => onViewChange(v.id)}>{v.label}</button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="card p-10 text-center text-sm text-text-dim">No {view} activity in this period.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Calls" value={latest.totals.calls.toLocaleString()} sub={`Latest ${noun}: ${latest.periodLabel}`} change={delta(latest.totals.calls, previous?.totals.calls)} />
            <Stat label="Meetings booked" value={latest.totals.meetings.toLocaleString()} sub={previous ? `${previous.totals.meetings} the ${noun} before` : 'No earlier period'} change={delta(latest.totals.meetings, previous?.totals.meetings)} />
            <Stat label="Show rate" value={latest.totals.attended + latest.totals.noShow > 0 ? `${Math.round(latest.totals.showRate * 100)}%` : '—'} sub={`${latest.totals.attended} confirmed · ${latest.totals.noShow} no-show`} change={null} />
            <Stat label="Closed" value={latest.totals.onboarded.toLocaleString()} sub={`${latest.totals.meetings > 0 ? Math.round(latest.totals.closeRate * 100) : 0}% close rate`} change={delta(latest.totals.onboarded, previous?.totals.onboarded)} />
          </div>

          <div className="card p-5">
            <div className="mb-4">
              <h3 className="font-serif text-base font-bold text-white">Calls and meetings by {noun}</h3>
              <p className="text-xs text-text-dim mt-0.5">Calls on the left axis; meetings booked and closed deals on the right{data.length > MAX_POINTS ? ` (last ${MAX_POINTS} ${noun}s)` : ''}</p>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                  <XAxis dataKey="period" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
                  <YAxis yAxisId="calls" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis yAxisId="mtg" orientation="right" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e1e23', borderColor: 'rgba(255,255,255,0.12)', borderRadius: '8px', color: '#f4f4f5' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} itemStyle={{ fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar yAxisId="calls" dataKey="Calls" fill="#71717a" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="mtg" type="monotone" dataKey="Meetings booked" stroke="#c9a84c" strokeWidth={2} dot={chartData.length < 15} />
                  <Line yAxisId="mtg" type="monotone" dataKey="Closed" stroke="#35e58a" strokeWidth={2} dot={chartData.length < 15} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 className="font-serif text-base font-bold text-white mb-1">Breakdown by {noun}</h3>
            <p className="text-xs text-text-dim mb-3">Click a row to expand the per-agent figures. Arrows compare calls with the {noun} before.</p>
            <PeriodicBreakdownTable key={view} data={data} emptyLabel={`No ${view} activity in this period`} />
          </div>
        </>
      )}
    </section>
  );
};
