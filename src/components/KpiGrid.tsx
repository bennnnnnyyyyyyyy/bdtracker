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
}

function KpiCard({ icon, label, value, sub, tone = 'neutral' }: KpiCardProps) {
  const valueClass = tone === 'success' ? 'text-success' : tone === 'gold' ? 'text-gold-light' : 'text-white';
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="label-caps">{label}</span>
        <span className="text-text-dim">{icon}</span>
      </div>
      <strong className={`font-num text-3xl leading-none ${valueClass}`}>{value}</strong>
      <span className="text-xs text-text-muted">{sub}</span>
    </div>
  );
}

export const KpiGrid: React.FC<{ totals: OrgTotals }> = React.memo(({ totals }) => (
  <section aria-label="Team summary" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
    <KpiCard label="Calls" value={totals.calls.toLocaleString()} sub={`${totals.callsPerPresentDay} per present day`} icon={<PhoneCall className="w-4 h-4" />} />
    <KpiCard label="Answer rate" value={formatPercent(totals.answerRate)} sub={`${totals.answered.toLocaleString()} answered`} icon={<PhoneIncoming className="w-4 h-4" />} />
    <KpiCard label="Meetings booked" value={totals.booked.toLocaleString()} sub={`${totals.medBCount} Med B · ${totals.ppoCount} PPO`} icon={<CalendarCheck className="w-4 h-4" />} tone="gold" />
    <KpiCard label="Show rate" value={formatPercent(totals.showRate)} sub={`${totals.attended} confirmed · ${totals.noShow} no-show${totals.awaitingConfirmation > 0 ? ` · ${totals.awaitingConfirmation} awaiting confirmation` : ''}`} icon={<TrendingUp className="w-4 h-4" />} tone="success" />
    <KpiCard label="Onboarded" value={totals.onboarded.toLocaleString()} sub="Closed deals" icon={<CheckCircle className="w-4 h-4" />} tone="gold" />
    <KpiCard label="Close rate" value={formatPercent(totals.closeRate)} sub={`${totals.callsPerMeeting} calls per meeting`} icon={<Target className="w-4 h-4" />} tone="success" />
  </section>
));

KpiGrid.displayName = 'KpiGrid';
