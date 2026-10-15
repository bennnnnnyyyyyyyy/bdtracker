'use client';

import React from 'react';
import { CalendarCheck, CheckCircle, PhoneCall, PhoneIncoming, Target, TrendingUp } from 'lucide-react';
import { OrgTotals } from '@/types/dashboard';
import { formatPercent } from '@/lib/analytics';

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: 'neutral' | 'success' | 'gold';
  delta?: { text: string; direction: 'up' | 'down' | 'flat' } | null;
}

function KpiCard({ icon, label, value, sub, tone = 'neutral', delta }: KpiCardProps) {
  const valueClass = tone === 'success' ? 'text-success' : tone === 'gold' ? 'text-gold-light' : 'text-white';
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="label-caps">{label}</span>
        <span className="text-text-dim">{icon}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <strong className={`font-num text-3xl leading-none ${valueClass}`}>{value}</strong>
        {delta && (
          <span
            className={`font-num text-xs font-bold shrink-0 ${delta.direction === 'up' ? 'text-success' : delta.direction === 'down' ? 'text-danger' : 'text-text-dim'}`}
            title="Compared with the previous period of the same length"
          >
            {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '●'} {delta.text}
          </span>
        )}
      </div>
      <span className="text-xs text-text-muted">{sub}</span>
    </div>
  );
}

type Delta = { text: string; direction: 'up' | 'down' | 'flat' } | null;

function countDelta(curr: number, prev?: number): Delta {
  if (prev === undefined || prev === 0) return null;
  const pct = Math.round(((curr - prev) / prev) * 100);
  return { text: `${Math.abs(pct)}%`, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

function rateDelta(curr: number, prev?: number): Delta {
  if (prev === undefined || prev === 0) return null;
  const pts = Math.round((curr - prev) * 100);
  return { text: `${Math.abs(pts)} pts`, direction: pts > 0 ? 'up' : pts < 0 ? 'down' : 'flat' };
}

export const KpiGrid: React.FC<{ totals: OrgTotals; previous?: OrgTotals | null }> = React.memo(({ totals, previous }) => (
  <section aria-label="Team summary" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
    <KpiCard label="Calls" value={totals.calls.toLocaleString()} sub={`${totals.callsPerPresentDay} per present day`} icon={<PhoneCall className="w-4 h-4" />} delta={countDelta(totals.calls, previous?.calls)} />
    <KpiCard label="Answer rate" value={formatPercent(totals.answerRate)} sub={`${totals.answered.toLocaleString()} answered`} icon={<PhoneIncoming className="w-4 h-4" />} delta={rateDelta(totals.answerRate, previous?.answerRate)} />
    <KpiCard label="Meetings booked" value={totals.booked.toLocaleString()} sub={`${totals.medBCount} Med B · ${totals.ppoCount} PPO`} icon={<CalendarCheck className="w-4 h-4" />} tone="gold" delta={countDelta(totals.booked, previous?.booked)} />
    <KpiCard label="Show rate" value={formatPercent(totals.showRate)} sub={`${totals.attended} confirmed · ${totals.noShow} no-show${totals.awaitingConfirmation > 0 ? ` · ${totals.awaitingConfirmation} awaiting confirmation` : ''}`} icon={<TrendingUp className="w-4 h-4" />} tone="success" delta={rateDelta(totals.showRate, previous?.showRate)} />
    <KpiCard label="Onboarded" value={totals.onboarded.toLocaleString()} sub="Closed deals" icon={<CheckCircle className="w-4 h-4" />} tone="gold" delta={countDelta(totals.onboarded, previous?.onboarded)} />
    <KpiCard label="Close rate" value={formatPercent(totals.closeRate)} sub={`${totals.callsPerMeeting} calls per meeting`} icon={<Target className="w-4 h-4" />} tone="success" delta={rateDelta(totals.closeRate, previous?.closeRate)} />
  </section>
));

KpiGrid.displayName = 'KpiGrid';
