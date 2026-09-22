'use client';

import React from 'react';
import { CalendarCheck, CheckCircle, Gauge, Goal, Phone, TrendingUp, UsersRound, Zap } from 'lucide-react';
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
  <section aria-label="Executive team summary" className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
    <KpiCard label="Calls" value={totals.calls.toLocaleString()} sub={`${totals.outbound.toLocaleString()} outbound`} icon={<Phone className="w-4 h-4" />} />
    <KpiCard label="Connect rate" value={formatPercent(totals.connectionRate)} sub={`${totals.answered.toLocaleString()} answered / ${totals.calls.toLocaleString()}`} icon={<UsersRound className="w-4 h-4" />} tone="success" />
    <KpiCard label="Meetings booked" value={totals.booked.toLocaleString()} sub={`${totals.medBCount} Med B · ${totals.ppoCount} PPO`} icon={<CalendarCheck className="w-4 h-4" />} tone="gold" />
    <KpiCard label="Booking rate" value={totals.answered > 0 ? formatPercent(totals.bookingRate) : '—'} sub={totals.answered > 0 ? `${totals.booked} booked / ${totals.answered} answered` : 'No answered calls'} icon={<Goal className="w-4 h-4" />} tone="gold" />
    <KpiCard label="Show rate" value={totals.booked > 0 ? formatPercent(totals.showRate) : '—'} sub={`${totals.attended} attended · ${totals.noShow} no-show`} icon={<TrendingUp className="w-4 h-4" />} tone="success" />
    <KpiCard label="Onboarded" value={totals.onboarded.toLocaleString()} sub={`${totals.booked} total meetings`} icon={<CheckCircle className="w-4 h-4" />} tone="gold" />
    <KpiCard label="Close rate" value={totals.booked > 0 ? formatPercent(totals.closeRate) : '—'} sub={totals.booked > 0 ? `${totals.onboarded} onboarded / ${totals.booked} booked` : 'No booked meetings'} icon={<Gauge className="w-4 h-4" />} />
    <KpiCard label="Calls / present day" value={totals.totalPresentDays > 0 ? String(totals.callsPerPresentDay) : '—'} sub={totals.totalPresentDays > 0 ? `${totals.totalPresentDays} weighted present days` : 'Attendance unavailable'} icon={<Zap className="w-4 h-4" />} />
  </section>
));

KpiGrid.displayName = 'KpiGrid';
