'use client';

import React, { useState, useMemo } from 'react';
import { OpenerStats, PeriodicGroupSummary } from '@/types/dashboard';
import { Phone, Calendar, TrendingUp, Award, CalendarDays, ChevronRight } from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────── */
type Period = 'today' | 'week' | 'month' | 'custom';

interface AgentDashboardViewProps {
  openers: OpenerStats[];
  dailyBreakdown: PeriodicGroupSummary[];
  weeklyBreakdown: PeriodicGroupSummary[];
  monthlyBreakdown: PeriodicGroupSummary[];
}

interface AgentPeriodMetrics {
  name: string;
  calls: number;
  booked: number;
  showRate: number;
  noShow: number;
  attended: number;
  onboarded: number;
  answered: number;
  connectionRate: number;
}

/* ─── Date helpers ───────────────────────────────────────── */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function thisWeekKey() {
  const today = new Date();
  const year = today.getFullYear();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const oneJan = new Date(year, 0, 1);
  const dayOffset = Math.floor((monday.getTime() - oneJan.getTime()) / 86400000);
  const weekNum = Math.ceil((dayOffset + oneJan.getDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtPct(r: number) {
  if (!isFinite(r) || isNaN(r) || r === 0) return '—';
  return `${(r * 100).toFixed(0)}%`;
}

/* ─── Derive per-agent metrics ───────────────────────────── */
function deriveMetrics(
  period: Period,
  daily: PeriodicGroupSummary[],
  weekly: PeriodicGroupSummary[],
  monthly: PeriodicGroupSummary[],
  customStart: string,
  customEnd: string,
  allOpeners: OpenerStats[]
): AgentPeriodMetrics[] {
  let groups: PeriodicGroupSummary[] = [];

  if (period === 'today') {
    groups = daily.filter(g => g.periodKey === todayISO());
  } else if (period === 'week') {
    groups = weekly.filter(g => g.periodKey === thisWeekKey());
  } else if (period === 'month') {
    groups = monthly.filter(g => g.periodKey === thisMonthKey());
  } else {
    groups = customStart || customEnd
      ? daily.filter(g => {
          if (customStart && g.periodKey < customStart) return false;
          if (customEnd && g.periodKey > customEnd) return false;
          return true;
        })
      : daily;
  }

  const agg: Record<string, { calls: number; booked: number; noShow: number; attended: number; onboarded: number; answered: number }> = {};

  groups.forEach(g =>
    g.agents.forEach(a => {
      if (!agg[a.opener]) agg[a.opener] = { calls: 0, booked: 0, noShow: 0, attended: 0, onboarded: 0, answered: 0 };
      agg[a.opener].calls    += a.calls;
      agg[a.opener].booked   += a.meetings;
      agg[a.opener].noShow   += a.noShow;
      agg[a.opener].attended += a.attended;
      agg[a.opener].onboarded += a.onboarded;
      agg[a.opener].answered += a.answered;
    })
  );

  return allOpeners
    .filter(o => o.opener && o.opener !== 'undefined')
    .map(o => {
      const a = agg[o.opener] ?? { calls: 0, booked: 0, noShow: 0, attended: 0, onboarded: 0, answered: 0 };
      return {
        name: o.opener,
        calls: a.calls,
        booked: a.booked,
        showRate: a.booked > 0 ? a.attended / a.booked : 0,
        noShow: a.noShow,
        attended: a.attended,
        onboarded: a.onboarded,
        answered: a.answered,
        connectionRate: a.calls > 0 ? a.answered / a.calls : 0,
      };
    })
    .filter(m => m.calls > 0 || m.booked > 0)
    .sort((a, b) => b.calls - a.calls);
}

/* ─── Mini progress bar ──────────────────────────────────── */
function Bar({ value, max, gold }: { value: number; max: number; gold?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar-track w-full">
      <div className={`bar-fill ${gold ? 'bar-fill-gold' : 'bar-fill-white'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ─── Rate chip ──────────────────────────────────────────── */
function Chip({ value, good, ok }: { value: number; good: number; ok: number }) {
  const pct = isFinite(value) && !isNaN(value) ? value : 0;
  const cls = pct >= good ? 'pill-success' : pct >= ok ? 'pill-warn' : 'pill-danger';
  return <span className={`pill ${cls}`}>{fmtPct(value)}</span>;
}

/* ─── Agent card ─────────────────────────────────────────── */
function AgentCard({ agent, rank, maxCalls, maxBooked }: {
  agent: AgentPeriodMetrics;
  rank: number;
  maxCalls: number;
  maxBooked: number;
}) {
  const isTop = rank === 1;
  const initials = agent.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hue = (agent.name.charCodeAt(0) * 41 + (agent.name.charCodeAt(1) ?? 0) * 17) % 360;

  const showColor =
    agent.booked === 0 ? 'text-[#3f3f46]'
    : agent.showRate >= 0.6 ? 'text-[#4ade80]'
    : agent.showRate >= 0.4 ? 'text-[#e8c56a]'
    : 'text-[#f87171]';

  return (
    <div className={`card ${isTop ? 'card-gold' : ''} group relative overflow-hidden flex flex-col`}>
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-[13px]"
        style={{ background: `radial-gradient(ellipse at top left, hsl(${hue},40%,7%) 0%, transparent 65%)` }}
      />

      {/* Header */}
      <div className="relative flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 font-num"
          style={{
            background: `linear-gradient(135deg, hsl(${hue},40%,12%), hsl(${(hue + 40) % 360},40%,8%))`,
            border: `1px solid hsl(${hue},35%,24%)`,
            color: `hsl(${hue},55%,72%)`,
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-serif text-sm font-bold text-white truncate">{agent.name}</span>
            {isTop && <Award className="w-3.5 h-3.5 shrink-0 text-[#e8c56a]" />}
          </div>
          <div className="label-caps mt-0.5">#{rank} · Opener</div>
        </div>
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center font-num text-[10px] font-bold shrink-0"
          style={{
            background: isTop ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isTop ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.06)'}`,
            color: isTop ? '#e8c56a' : '#52525b',
          }}
        >
          {rank}
        </div>
      </div>

      {/* Three metric boxes */}
      <div className="relative grid grid-cols-3 gap-px flex-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {/* Calls */}
        <div className="flex flex-col gap-2 px-3.5 py-3.5 bg-card">
          <div className="flex items-center gap-1.5">
            <Phone className="w-2.5 h-2.5 text-[#52525b]" />
            <span className="label-caps">Calls</span>
          </div>
          <span className="font-num text-2xl font-bold text-white leading-none">{agent.calls.toLocaleString()}</span>
          <Bar value={agent.calls} max={maxCalls} />
        </div>

        {/* Booked */}
        <div className="flex flex-col gap-2 px-3.5 py-3.5 bg-card">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-2.5 h-2.5 text-[#52525b]" />
            <span className="label-caps">Booked</span>
          </div>
          <span className="font-num text-2xl font-bold text-white leading-none">{agent.booked.toLocaleString()}</span>
          <Bar value={agent.booked} max={maxBooked} gold />
        </div>

        {/* Show rate */}
        <div className="flex flex-col gap-2 px-3.5 py-3.5 bg-card">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-2.5 h-2.5 text-[#52525b]" />
            <span className="label-caps">Show</span>
          </div>
          <span className={`font-num text-2xl font-bold leading-none ${showColor}`}>
            {agent.booked === 0 ? '—' : fmtPct(agent.showRate)}
          </span>
          <Bar value={agent.booked === 0 ? 0 : agent.showRate} max={1} gold={agent.showRate >= 0.6} />
        </div>
      </div>

      {/* Footer */}
      <div className="relative flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Chip value={agent.connectionRate} good={0.5} ok={0.3} />
          <span className="label-caps">conn.</span>
        </div>
        <span className="label-caps">{agent.attended} showed · {agent.noShow} no-show</span>
      </div>
    </div>
  );
}

/* ─── Period button ──────────────────────────────────────── */
function PeriodBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
      style={active
        ? { background: '#ffffff', color: '#000000' }
        : { color: '#71717a', background: 'transparent' }
      }
    >
      {label}
    </button>
  );
}

/* ─── Main view ──────────────────────────────────────────── */
export function AgentDashboardView({ openers, dailyBreakdown, weeklyBreakdown, monthlyBreakdown }: AgentDashboardViewProps) {
  const [period, setPeriod] = useState<Period>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const metrics = useMemo(
    () => deriveMetrics(period, dailyBreakdown, weeklyBreakdown, monthlyBreakdown, customStart, customEnd, openers),
    [period, dailyBreakdown, weeklyBreakdown, monthlyBreakdown, customStart, customEnd, openers]
  );

  const maxCalls  = Math.max(1, ...metrics.map(m => m.calls));
  const maxBooked = Math.max(1, ...metrics.map(m => m.booked));

  const totalCalls    = metrics.reduce((s, m) => s + m.calls, 0);
  const totalBooked   = metrics.reduce((s, m) => s + m.booked, 0);
  const totalAttended = metrics.reduce((s, m) => s + m.attended, 0);
  const avgShow = totalBooked > 0 ? fmtPct(totalAttended / totalBooked) : '—';

  const periodTitle =
    period === 'today' ? todayISO()
    : period === 'week' ? 'This Week'
    : period === 'month' ? new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : customStart && customEnd ? `${customStart} → ${customEnd}`
    : 'All Time';

  const PERIODS: { id: Period; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week',  label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-5">

      {/* Header row */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="sec-tag mb-1">Agent Performance</div>
          <h2 className="font-serif text-xl font-bold text-white">{periodTitle}</h2>
        </div>

        {/* Period toggle */}
        <div
          className="flex items-center gap-0.5 p-1 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {PERIODS.map(p => (
            <PeriodBtn key={p.id} active={period === p.id} label={p.label} onClick={() => setPeriod(p.id)} />
          ))}
        </div>
      </div>

      {/* Custom date range */}
      {period === 'custom' && (
        <div
          className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <CalendarDays className="w-4 h-4 text-[#52525b]" />
          <span className="label-caps">From</span>
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="font-num rounded-lg px-3 py-1.5 outline-none"
            style={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontSize: 11 }}
          />
          <ChevronRight className="w-3.5 h-3.5 text-[#52525b]" />
          <span className="label-caps">To</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="font-num rounded-lg px-3 py-1.5 outline-none"
            style={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', fontSize: 11 }}
          />
        </div>
      )}

      {/* Team summary strip */}
      {metrics.length > 0 && (
        <div
          className="grid grid-cols-3 gap-px rounded-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {[
            { label: 'Total Calls',      value: totalCalls.toLocaleString() },
            { label: 'Meetings Booked',  value: totalBooked.toLocaleString() },
            { label: 'Avg Show Rate',    value: avgShow },
          ].map(stat => (
            <div key={stat.label} className="flex flex-col gap-1.5 px-5 py-4 bg-[#17171a]">
              <span className="label-caps">{stat.label}</span>
              <span className="font-num text-xl font-bold text-white">{stat.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cards grid or empty state */}
      {metrics.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{ background: '#17171a', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Phone className="w-8 h-8 mb-3 text-[#3f3f46]" />
          <p className="label-caps text-text-faint">No activity in this period</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {metrics.map((agent, i) => (
            <AgentCard
              key={agent.name}
              agent={agent}
              rank={i + 1}
              maxCalls={maxCalls}
              maxBooked={maxBooked}
            />
          ))}
        </div>
      )}

    </div>
  );
}
