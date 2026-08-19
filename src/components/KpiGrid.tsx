'use client';

import React from 'react';
import { Phone, CalendarCheck, CheckCircle, TrendingUp, Zap } from 'lucide-react';
import { OrgTotals } from '@/types/dashboard';
import { formatPercent } from '@/lib/analytics';

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, label, value, sub, valueClass = 'text-white' }) => (
  <div className="card relative overflow-hidden p-5 flex flex-col gap-3">
    {/* top accent line — gold */}
    <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-[#c9a84c]/50 to-transparent" />

    <div className="flex items-center justify-between">
      <span className="label-caps">{label}</span>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {icon}
      </div>
    </div>

    <div className={`font-num text-3xl font-bold ${valueClass}`}>{value}</div>

    {sub && (
      <div className="text-[11px] text-[#71717a] font-num">{sub}</div>
    )}
  </div>
);

export const KpiGrid: React.FC<{ totals: OrgTotals }> = React.memo(({ totals }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
    <KpiCard
      label="Total Calls"
      value={totals.calls.toLocaleString()}
      sub={`${totals.outbound.toLocaleString()} out · ${totals.inbound.toLocaleString()} in`}
      icon={<Phone className="w-3.5 h-3.5 text-[#a1a1aa]" />}
    />
    <KpiCard
      label="Connection Rate"
      value={formatPercent(totals.connectionRate)}
      sub={`${totals.answered.toLocaleString()} answered`}
      icon={<Zap className="w-3.5 h-3.5 text-[#e8c56a]" />}
      valueClass="text-[#e8c56a]"
    />
    <KpiCard
      label="Meetings Booked"
      value={totals.booked.toLocaleString()}
      sub={`${totals.attended} attended`}
      icon={<CalendarCheck className="w-3.5 h-3.5 text-[#a1a1aa]" />}
    />
    <KpiCard
      label="Show Rate"
      value={formatPercent(totals.showRate)}
      sub={`${totals.noShow} no-shows`}
      icon={<TrendingUp className="w-3.5 h-3.5 text-[#4ade80]" />}
      valueClass="text-[#4ade80]"
    />
    <KpiCard
      label="Closing Rate"
      value={formatPercent(totals.closeRate)}
      sub={`${totals.onboarded} onboarded`}
      icon={<CheckCircle className="w-3.5 h-3.5 text-[#c9a84c]" />}
      valueClass="text-[#c9a84c]"
    />
  </div>
));

KpiGrid.displayName = 'KpiGrid';
