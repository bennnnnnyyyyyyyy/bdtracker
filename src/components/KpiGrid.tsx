'use client';

import React from 'react';
import { CalendarCheck, CheckCircle, Phone, TrendingUp } from 'lucide-react';
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
  return <div className="card p-4 flex flex-col gap-2"><div className="flex items-center justify-between"><span className="label-caps">{label}</span><span className="text-text-dim">{icon}</span></div><strong className={`font-num text-2xl ${valueClass}`}>{value}</strong><span className="text-[11px] text-text-dim font-num">{sub}</span></div>;
}

export const KpiGrid: React.FC<{ totals: OrgTotals }> = React.memo(({ totals }) => (
  <section aria-label="Team summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <KpiCard label="Calls" value={totals.calls.toLocaleString()} sub={`${totals.callsPerPresentDay}/present day`} icon={<Phone className="w-4 h-4" />} />
    <KpiCard label="Meetings booked" value={totals.booked.toLocaleString()} sub={`${totals.medBCount} Med B · ${totals.ppoCount} PPO`} icon={<CalendarCheck className="w-4 h-4" />} tone="gold" />
    <KpiCard label="Show rate" value={formatPercent(totals.showRate)} sub={`${totals.attended} attended · ${totals.noShow} no-show`} icon={<TrendingUp className="w-4 h-4" />} tone="success" />
    <KpiCard label="Onboarded" value={totals.onboarded.toLocaleString()} sub={`${formatPercent(totals.closeRate)} close rate`} icon={<CheckCircle className="w-4 h-4" />} tone="gold" />
  </section>
));

KpiGrid.displayName = 'KpiGrid';
