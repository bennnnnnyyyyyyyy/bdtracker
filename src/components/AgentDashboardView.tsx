'use client';

import React from 'react';
import { OpenerStats, OrgTotals, FilterState } from '@/types/dashboard';
import { Phone, Calendar, TrendingUp, Award, User } from 'lucide-react';
import { formatPercent } from '@/lib/analytics';

function formatLocalDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


/* ─── Types ─────────────────────────────────────────────── */
interface AgentDashboardViewProps {
  openers: OpenerStats[];
  totals: OrgTotals;
  filters: FilterState;
}

function fmtPct(r: number) {
  if (!isFinite(r) || isNaN(r) || r === 0) return '—';
  return `${(r * 100).toFixed(0)}%`;
}

function getPeriodTitle(filters: FilterState): string {
  if (filters.preset === 'today') {
    return `Today · ${filters.startDate || formatLocalDateYMD(new Date())}`;
  }
  if (filters.preset === 'this_week') return 'This Week';
  if (filters.preset === 'this_month') return 'This Month';
  if (filters.preset === 'last_30_days') return 'Last 30 Days';
  if (filters.startDate && filters.endDate) return `${filters.startDate} → ${filters.endDate}`;
  if (filters.startDate) return `From ${filters.startDate}`;
  if (filters.endDate) return `Until ${filters.endDate}`;
  return 'All Time';
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
  agent: OpenerStats;
  rank: number;
  maxCalls: number;
  maxBooked: number;
}) {
  const isTop = rank === 1;
  const initials = agent.opener.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'AG';
  const hue = (agent.opener.charCodeAt(0) * 41 + (agent.opener.charCodeAt(1) ?? 0) * 17) % 360;

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
            <span className="font-serif text-sm font-bold text-white truncate">{agent.opener}</span>
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
          <Chip value={agent.answerRate} good={0.5} ok={0.3} />
          <span className="label-caps">conn.</span>
        </div>
        <span className="label-caps">{agent.attended} showed · {agent.noShow} no-show</span>
      </div>
    </div>
  );
}

/* ─── Main view ──────────────────────────────────────────── */
export function AgentDashboardView({ openers, totals, filters }: AgentDashboardViewProps) {
  const activeOpeners = openers
    .filter(o => o.opener && o.opener !== 'undefined')
    .sort((a, b) => b.calls - a.calls || b.booked - a.booked);

  const maxCalls  = Math.max(1, ...activeOpeners.map(m => m.calls));
  const maxBooked = Math.max(1, ...activeOpeners.map(m => m.booked));
  const periodTitle = getPeriodTitle(filters);

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="sec-tag mb-1">Agent Performance</div>
          <h2 className="font-serif text-xl font-bold text-white">{periodTitle}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="label-caps">{activeOpeners.length} Active {activeOpeners.length === 1 ? 'Agent' : 'Agents'}</span>
        </div>
      </div>

      {/* Team summary strip */}
      {activeOpeners.length > 0 && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {[
            { label: 'Total Calls',     value: totals.calls.toLocaleString() },
            { label: 'Meetings Booked', value: totals.booked.toLocaleString() },
            { label: 'Avg Show Rate',   value: formatPercent(totals.showRate) },
            { label: 'Onboarded',       value: totals.onboarded.toLocaleString() },
          ].map(stat => (
            <div key={stat.label} className="flex flex-col gap-1.5 px-5 py-4 bg-[#17171a]">
              <span className="label-caps">{stat.label}</span>
              <span className="font-num text-xl font-bold text-white">{stat.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cards grid or empty state */}
      {activeOpeners.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{ background: '#17171a', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Phone className="w-8 h-8 mb-3 text-[#3f3f46]" />
          <p className="label-caps text-text-faint">No agent activity found in this period</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeOpeners.map((agent, i) => (
            <AgentCard
              key={agent.opener}
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

