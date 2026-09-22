'use client';

import React, { memo, useMemo } from 'react';
import { Award, Calendar, CheckCircle2, Phone, TrendingUp, UsersRound } from 'lucide-react';
import { FilterState, OpenerStats } from '@/types/dashboard';

interface AgentDashboardViewProps {
  openers: OpenerStats[];
  filters: FilterState;
}

function formatLocalDateYMD(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function formatRate(rate: number, hasDenominator: boolean): string {
  return hasDenominator && Number.isFinite(rate) ? `${Math.round(rate * 100)}%` : '—';
}

function getPeriodTitle(filters: FilterState): string {
  if (filters.preset === 'today') return `Today · ${filters.startDate || formatLocalDateYMD(new Date())}`;
  if (filters.preset === 'this_week') return 'This Week';
  if (filters.preset === 'this_month') return 'This Month';
  if (filters.preset === 'last_30_days') return 'Last 30 Days';
  if (filters.startDate && filters.endDate) return `${filters.startDate} → ${filters.endDate}`;
  return 'Current period';
}

type TeamBenchmarks = { connectionRate: number; bookingRate: number; showRate: number; closeRate: number; callsPerPresentDay: number };

function coachingStatus(agent: OpenerStats, benchmarks: TeamBenchmarks): { label: string; className: string } {
  if (agent.calls > 0 && agent.connectionRate < benchmarks.connectionRate) return { label: 'Connectivity needs attention', className: 'pill-danger' };
  if (agent.answered > 0 && agent.bookingRate < benchmarks.bookingRate) return { label: 'Conversion needs attention', className: 'pill-danger' };
  if (agent.booked > 0 && agent.showRate < benchmarks.showRate) return { label: 'Show rate needs attention', className: 'pill-warn' };
  if (agent.booked > 0 && agent.closeRate < benchmarks.closeRate) return { label: 'Close rate needs attention', className: 'pill-warn' };
  if (agent.presentDays > 0 && agent.callsPerPresentDay < benchmarks.callsPerPresentDay) return { label: 'Activity needs attention', className: 'pill-warn' };
  return { label: 'On track', className: 'pill-success' };
}

const AgentCard = memo(function AgentCard({ agent, rank, maxCalls, maxBooked, benchmarks }: {
  agent: OpenerStats;
  rank: number;
  maxCalls: number;
  maxBooked: number;
  benchmarks: TeamBenchmarks;
}) {
  const isTop = rank === 1;
  const status = coachingStatus(agent, benchmarks);
  const productivity = agent.presentDays > 0
    ? `${agent.callsPerPresentDay}/day · ${agent.presentDays} present days`
    : `${agent.callsPerCalendarDay ?? 0}/calendar day`;

  return (
    <article className={`card ${isTop ? 'card-gold' : ''} overflow-hidden`}>
      <header className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-white/6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-base font-bold text-white truncate">{agent.opener}</h3>
            {isTop && <Award className="w-4 h-4 shrink-0 text-gold-light" aria-label="Top performer" />}
          </div>
          <p className="label-caps mt-1">#{rank} · {productivity}</p>
        </div>
        <span className={`pill ${status.className} shrink-0`}>{status.label}</span>
      </header>

      <div className="grid grid-cols-2 gap-px bg-white/5">
        <Metric label="Calls" value={agent.calls.toLocaleString()} ratio={agent.calls / maxCalls} tone="neutral" icon={<Phone className="w-3 h-3" />} />
        <Metric label="Connect" value={formatRate(agent.connectionRate, agent.calls > 0)} tone={agent.connectionRate >= benchmarks.connectionRate ? 'success' : 'danger'} icon={<UsersRound className="w-3 h-3" />} />
        <Metric label="Booked" value={agent.booked.toLocaleString()} ratio={agent.booked / maxBooked} tone="gold" icon={<Calendar className="w-3 h-3" />} />
        <Metric label="Booking rate" value={formatRate(agent.bookingRate, agent.answered > 0)} tone={agent.answered > 0 && agent.bookingRate >= benchmarks.bookingRate ? 'success' : 'neutral'} />
        <Metric label="Show rate" value={formatRate(agent.showRate, agent.booked > 0)} tone={agent.showRate >= 0.6 ? 'success' : agent.showRate >= 0.4 ? 'gold' : 'danger'} icon={<TrendingUp className="w-3 h-3" />} />
        <Metric label="Close rate" value={formatRate(agent.closeRate, agent.booked > 0)} tone={agent.closeRate >= benchmarks.closeRate ? 'success' : 'neutral'} icon={<CheckCircle2 className="w-3 h-3" />} />
      </div>
      <div className="px-4 py-2.5 flex items-center justify-between text-[10px] font-num text-text-dim border-t border-white/6"><span>{agent.presentDays > 0 ? `${agent.presentDays} present days · ${agent.callsPerPresentDay}/day` : 'Attendance unavailable'}</span><span>{agent.onboarded} onboarded</span></div>
    </article>
  );
});

function Metric({ label, value, ratio, tone = 'neutral', icon }: { label: string; value: string; ratio?: number; tone?: 'neutral' | 'gold' | 'success' | 'danger'; icon?: React.ReactNode }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : tone === 'gold' ? 'text-gold-light' : 'text-white';
  const barClass = tone === 'success' ? 'bar-fill-success' : tone === 'danger' ? 'bar-fill-danger' : tone === 'gold' ? 'bar-fill-gold' : 'bar-fill-white';
  return (
    <div className="bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 label-caps">{icon}{label}</div>
      <div className={`font-num text-xl font-bold mt-1 ${toneClass}`}>{value}</div>
      {ratio !== undefined && <div className="bar-track mt-2"><div className={`bar-fill ${barClass}`} style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} /></div>}
    </div>
  );
}

export function AgentDashboardView({ openers, filters }: AgentDashboardViewProps) {
  const activeOpeners = useMemo(() => openers
    .filter((opener) => opener.opener && opener.opener !== 'undefined')
    .sort((a, b) => b.onboarded - a.onboarded || b.booked - a.booked || b.bookingRate - a.bookingRate), [openers]);
  const maxCalls = useMemo(() => Math.max(1, ...activeOpeners.map((agent) => agent.calls)), [activeOpeners]);
  const maxBooked = useMemo(() => Math.max(1, ...activeOpeners.map((agent) => agent.booked)), [activeOpeners]);
  const benchmarks = useMemo<TeamBenchmarks>(() => {
    const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return {
      connectionRate: avg(activeOpeners.filter(agent => agent.calls > 0).map(agent => agent.connectionRate)),
      bookingRate: avg(activeOpeners.filter(agent => agent.answered > 0).map(agent => agent.bookingRate)),
      showRate: avg(activeOpeners.filter(agent => agent.booked > 0).map(agent => agent.showRate)),
      closeRate: avg(activeOpeners.filter(agent => agent.booked > 0).map(agent => agent.closeRate)),
      callsPerPresentDay: avg(activeOpeners.filter(agent => agent.presentDays > 0).map(agent => agent.callsPerPresentDay)),
    };
  }, [activeOpeners]);

  return (
    <section aria-labelledby="team-performance-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="sec-tag mb-1">Team performance</p>
          <h2 id="team-performance-heading" className="font-serif text-xl font-bold text-white">{getPeriodTitle(filters)}</h2>
        </div>
        <p className="label-caps">{activeOpeners.length} active agents</p>
      </div>

      {activeOpeners.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20">
          <Phone className="w-8 h-8 mb-3 text-text-faint" />
          <p className="label-caps">No agent activity found in this period</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeOpeners.map((agent, index) => <AgentCard key={agent.opener} agent={agent} rank={index + 1} maxCalls={maxCalls} maxBooked={maxBooked} benchmarks={benchmarks} />)}
        </div>
      )}
    </section>
  );
}
