'use client';

import React from 'react';
import { Phone, CalendarCheck, CheckCircle, TrendingUp, Zap } from 'lucide-react';
import { OrgTotals } from '@/types/dashboard';
import { formatPercent } from '@/lib/analytics';

interface KpiGridProps {
  totals: OrgTotals;
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  subLabel?: string;
  accentColor: string;
  iconBg: string;
  valueColor?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  icon, label, value, subValue, subLabel, accentColor, iconBg, valueColor = 'text-white'
}) => (
  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-slate-700 transition-all">
    <div className={`absolute top-0 left-0 h-1 w-full ${accentColor} rounded-t-xl`} />
    <div className="flex items-center justify-between mb-3">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      <div className={`p-2 rounded-lg ${iconBg}`}>
        {icon}
      </div>
    </div>
    <div className={`text-3xl font-bold tracking-tight ${valueColor}`}>{value}</div>
    {subValue && subLabel && (
      <div className="mt-1.5 text-xs text-slate-400">
        {subLabel}: <span className="text-slate-200 font-medium">{subValue}</span>
      </div>
    )}
  </div>
);

export const KpiGrid: React.FC<KpiGridProps> = ({ totals }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. Calls */}
      <KpiCard
        label="Total Calls"
        value={totals.calls.toLocaleString()}
        subValue={`${totals.outbound.toLocaleString()} out · ${totals.inbound.toLocaleString()} in`}
        subLabel="Volume"
        icon={<Phone className="w-4 h-4 text-blue-400" />}
        iconBg="bg-blue-500/10"
        accentColor="bg-blue-500"
      />

      {/* 2. Connection (Answer) Rate */}
      <KpiCard
        label="Connection Rate"
        value={formatPercent(totals.connectionRate)}
        subValue={`${totals.answered.toLocaleString()} answered`}
        subLabel="of"
        icon={<Zap className="w-4 h-4 text-cyan-400" />}
        iconBg="bg-cyan-500/10"
        accentColor="bg-cyan-500"
        valueColor="text-cyan-400"
      />

      {/* 3. Meetings */}
      <KpiCard
        label="Meetings Booked"
        value={totals.booked.toLocaleString()}
        subValue={`${totals.attended} attended`}
        subLabel="Showed up"
        icon={<CalendarCheck className="w-4 h-4 text-indigo-400" />}
        iconBg="bg-indigo-500/10"
        accentColor="bg-indigo-500"
      />

      {/* 4. Show Rate */}
      <KpiCard
        label="Show Rate"
        value={formatPercent(totals.showRate)}
        subValue={`${totals.noShow} no-shows`}
        subLabel="Out of"
        icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
        iconBg="bg-emerald-500/10"
        accentColor="bg-emerald-500"
        valueColor="text-emerald-400"
      />

      {/* 5. Closing Rate */}
      <KpiCard
        label="Closing Rate"
        value={formatPercent(totals.closeRate)}
        subValue={`${totals.onboarded} onboarded`}
        subLabel="Closed"
        icon={<CheckCircle className="w-4 h-4 text-purple-400" />}
        iconBg="bg-purple-500/10"
        accentColor="bg-purple-500"
        valueColor="text-purple-400"
      />
    </div>
  );
};


