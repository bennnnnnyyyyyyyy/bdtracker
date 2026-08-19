'use client';

import React, { useState, useMemo } from 'react';
import { OpenerStats, PeriodicGroupSummary } from '@/types/dashboard';
import { Phone, Calendar, TrendingUp, Award, CalendarDays, ChevronDown } from 'lucide-react';

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
  closeRate: number;
  answered: number;
  connectionRate: number;
}

/* ─── Helpers ────────────────────────────────────────────── */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function thisWeekMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function fmtPct(r: number) {
  if (!isFinite(r) || isNaN(r)) return '—';
  return `${(r * 100).toFixed(0)}%`;
}

/* ─── Derive per-agent metrics from breakdown data ─────── */
function deriveMetrics(
  period: Period,
  dailyBreakdown: PeriodicGroupSummary[],
  weeklyBreakdown: PeriodicGroupSummary[],
  monthlyBreakdown: PeriodicGroupSummary[],
  customStart: string,
  customEnd: string,
  allOpeners: OpenerStats[]
): AgentPeriodMetrics[] {
  let groups: PeriodicGroupSummary[] = [];

  if (period === 'today') {
    const key = todayISO();
    groups = dailyBreakdown.filter(g => g.periodKey === key);
  } else if (period === 'week') {
    // current ISO week key: find the week group that contains today
    const monday = thisWeekMonday();
    groups = weeklyBreakdown.filter(g => {
      // period label is "Aug 18 – Aug 24, 2026" style — use key e.g. "2026-W34"
      // easier: pick groups whose ISO key year-week contains today's monday
      // We'll just find weekly groups where the key's monday <= today <= sunday
      const d = new Date(monday + 'T00:00:00');
      const sunday = new Date(d);
      sunday.setDate(d.getDate() + 6);
      // parse periodLabel to find if it overlaps
      // simpler: the weekly group with the highest key that starts on or before today
      return g.periodKey >= `${new Date().getFullYear()}-W01`; // placeholder, filter below
    });
    // Actually: find the single week group whose periodKey matches this week
    const today = new Date();
    const year = today.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const mondayDate = new Date(monday + 'T00:00:00');
    const dayOffset = Math.floor((mondayDate.getTime() - oneJan.getTime()) / 86400000);
    const weekNum = Math.ceil((dayOffset + oneJan.getDay() + 1) / 7);
    const thisWeekKey = `${year}-W${String(weekNum).padStart(2, '0')}`;
    groups = weeklyBreakdown.filter(g => g.periodKey === thisWeekKey);
  } else if (period === 'month') {
    const key = thisMonthKey();
    groups = monthlyBreakdown.filter(g => g.periodKey === key);
  } else if (period === 'custom') {
    if (!customStart && !customEnd) {
      groups = dailyBreakdown;
    } else {
      groups = dailyBreakdown.filter(g => {
        if (customStart && g.periodKey < customStart) return false;
        if (customEnd && g.periodKey > customEnd) return false;
        return true;
      });
    }
  }

  // Aggregate across matched groups per agent
  const agg: Record<string, {
    calls: number; booked: number; noShow: number; attended: number;
    onboarded: number; answered: number;
  }> = {};

  groups.forEach(g => {
    g.agents.forEach(a => {
      if (!agg[a.opener]) {
        agg[a.opener] = { calls: 0, booked: 0, noShow: 0, attended: 0, onboarded: 0, answered: 0 };
      }
      agg[a.opener].calls += a.calls;
      agg[a.opener].booked += a.meetings;
      agg[a.opener].noShow += a.noShow;
      agg[a.opener].attended += a.attended;
      agg[a.opener].onboarded += a.onboarded;
      agg[a.opener].answered += a.answered;
    });
  });

  // Build result — include all openers from allOpeners so we see everyone even if zero
  const result: AgentPeriodMetrics[] = allOpeners
    .filter(o => o.opener && o.opener !== 'undefined')
    .map(o => {
      const a = agg[o.opener] ?? { calls: 0, booked: 0, noShow: 0, attended: 0, onboarded: 0, answered: 0 };
      const showRate = a.booked > 0 ? a.attended / a.booked : 0;
      const closeRate = a.booked > 0 ? a.onboarded / a.booked : 0;
      const connectionRate = a.calls > 0 ? a.answered / a.calls : 0;
      return {
        name: o.opener,
        calls: a.calls,
        booked: a.booked,
        showRate,
        noShow: a.noShow,
        attended: a.attended,
        onboarded: a.onboarded,
        closeRate,
        answered: a.answered,
        connectionRate,
      };
    })
    .filter(m => m.calls > 0 || m.booked > 0)
    .sort((a, b) => b.calls - a.calls);

  return result;
}

/* ─── Mini bar ──────────────────────────────────────────── */
function Bar({ value, max, gold }: { value: number; max: number; gold?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-0.75 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${pct}%`,
          background: gold
            ? 'linear-gradient(90deg, #b8922a, #e8c56a)'
            : 'linear-gradient(90deg, #3a3a3f, #ffffff)',
        }}
      />
    </div>
  );
}

/* ─── Rate chip ─────────────────────────────────────────── */
function Chip({ value, good, ok }: { value: number; good: number; ok: number }) {
  const pct = isFinite(value) && !isNaN(value) ? value : 0;
  const style =
    pct >= good
      ? { color: '#7ee8a2', background: 'rgba(126,232,162,0.08)', border: '1px solid rgba(126,232,162,0.2)' }
      : pct >= ok
      ? { color: '#e8c56a', background: 'rgba(232,197,106,0.08)', border: '1px solid rgba(232,197,106,0.2)' }
      : { color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' };

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide"
      style={{ fontFamily: "'JetBrains Mono', monospace", ...style }}
    >
      {fmtPct(value)}
    </span>
  );
}

/* ─── Agent card ─────────────────────────────────────────── */
function AgentCard({
  agent,
  rank,
  maxCalls,
  maxBooked,
}: {
  agent: AgentPeriodMetrics;
  rank: number;
  maxCalls: number;
  maxBooked: number;
}) {
  const isTop = rank === 1;
  const initials = agent.name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const hue = (agent.name.charCodeAt(0) * 41 + (agent.name.charCodeAt(1) ?? 0) * 17) % 360;

  return (
    <div
      className="group relative flex flex-col gap-0 overflow-hidden transition-all duration-300"
      style={{
        background: isTop ? 'linear-gradient(160deg, #1a1608 0%, #121215 60%)' : '#121215',
        border: `1px solid ${isTop ? 'rgba(184,146,42,0.35)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14,
        boxShadow: isTop ? '0 0 0 1px rgba(184,146,42,0.15), 0 16px 40px rgba(0,0,0,0.5)' : 'none',
      }}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-[13px]"
        style={{ background: `radial-gradient(ellipse at top left, hsl(${hue},40%,8%) 0%, transparent 65%)` }}
      />

      {/* Card header */}
      <div
        className="relative flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 border"
          style={{
            background: `linear-gradient(135deg, hsl(${hue},50%,14%), hsl(${(hue + 40) % 360},50%,10%))`,
            borderColor: `hsl(${hue},40%,28%)`,
            fontFamily: "'JetBrains Mono', monospace",
            color: `hsl(${hue},60%,75%)`,
          }}
        >
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-bold truncate"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", color: '#f4f4f5', letterSpacing: '-0.01em' }}
            >
              {agent.name}
            </span>
            {isTop && <Award className="w-3.5 h-3.5 shrink-0" style={{ color: '#e8c56a' }} />}
          </div>
          <div
            className="text-[10px] uppercase tracking-[0.12em] mt-0.5"
            style={{ color: '#52525b', fontFamily: "'JetBrains Mono', monospace" }}
          >
            #{rank} · Opener
          </div>
        </div>

        {/* Rank badge */}
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0"
          style={{
            background: isTop ? 'rgba(184,146,42,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isTop ? 'rgba(184,146,42,0.3)' : 'rgba(255,255,255,0.06)'}`,
            color: isTop ? '#e8c56a' : '#71717a',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
          }}
        >
          {rank}
        </div>
      </div>

      {/* Three hero metrics */}
      <div className="relative grid grid-cols-3 gap-px" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {/* Calls */}
        <div className="flex flex-col gap-2 px-4 py-4" style={{ background: '#121215' }}>
          <div className="flex items-center gap-1.5">
            <Phone className="w-3 h-3" style={{ color: '#52525b' }} />
            <span
              className="text-[9px] uppercase tracking-[0.12em]"
              style={{ color: '#52525b', fontFamily: "'JetBrains Mono', monospace" }}
            >
              Calls
            </span>
          </div>
          <span
            className="text-2xl font-bold leading-none"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: '#ffffff',
              letterSpacing: '-0.02em',
            }}
          >
            {fmt(agent.calls)}
          </span>
          <Bar value={agent.calls} max={maxCalls} />
        </div>

        {/* Booked */}
        <div className="flex flex-col gap-2 px-4 py-4" style={{ background: '#121215' }}>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3" style={{ color: '#52525b' }} />
            <span
              className="text-[9px] uppercase tracking-[0.12em]"
              style={{ color: '#52525b', fontFamily: "'JetBrains Mono', monospace" }}
            >
              Booked
            </span>
          </div>
          <span
            className="text-2xl font-bold leading-none"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: '#ffffff',
              letterSpacing: '-0.02em',
            }}
          >
            {fmt(agent.booked)}
          </span>
          <Bar value={agent.booked} max={maxBooked} gold />
        </div>

        {/* Show Rate */}
        <div className="flex flex-col gap-2 px-4 py-4" style={{ background: '#121215' }}>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" style={{ color: '#52525b' }} />
            <span
              className="text-[9px] uppercase tracking-[0.12em]"
              style={{ color: '#52525b', fontFamily: "'JetBrains Mono', monospace" }}
            >
              Show
            </span>
          </div>
          <span
            className="text-2xl font-bold leading-none"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: agent.showRate >= 0.6 ? '#7ee8a2' : agent.showRate >= 0.4 ? '#e8c56a' : agent.booked === 0 ? '#3f3f46' : '#f87171',
              letterSpacing: '-0.02em',
            }}
          >
            {agent.booked === 0 ? '—' : fmtPct(agent.showRate)}
          </span>
          <Bar value={agent.booked === 0 ? 0 : agent.showRate} max={1} gold={agent.showRate >= 0.6} />
        </div>
      </div>

      {/* Footer row */}
      <div className="relative flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <Chip value={agent.connectionRate} good={0.5} ok={0.3} />
          <span
            className="text-[9px] uppercase tracking-[0.08em]"
            style={{ color: '#3f3f46', fontFamily: "'JetBrains Mono', monospace" }}
          >
            Conn.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] uppercase tracking-[0.08em]"
            style={{ color: '#3f3f46', fontFamily: "'JetBrains Mono', monospace" }}
          >
            {agent.attended} showed · {agent.noShow} no-show
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Period toggle button ──────────────────────────────── */
function PeriodBtn({
  id,
  label,
  active,
  onClick,
}: {
  id: Period;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="transition-all duration-150 cursor-pointer"
      style={{
        padding: '6px 14px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        letterSpacing: '0.04em',
        background: active ? '#ffffff' : 'transparent',
        color: active ? '#000000' : '#71717a',
        border: 'none',
        outline: 'none',
      }}
    >
      {label}
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────── */
export function AgentDashboardView({
  openers,
  dailyBreakdown,
  weeklyBreakdown,
  monthlyBreakdown,
}: AgentDashboardViewProps) {
  const [period, setPeriod] = useState<Period>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const metrics = useMemo(
    () => deriveMetrics(period, dailyBreakdown, weeklyBreakdown, monthlyBreakdown, customStart, customEnd, openers),
    [period, dailyBreakdown, weeklyBreakdown, monthlyBreakdown, customStart, customEnd, openers]
  );

  const maxCalls = Math.max(1, ...metrics.map(m => m.calls));
  const maxBooked = Math.max(1, ...metrics.map(m => m.booked));

  const periodLabel =
    period === 'today'
      ? todayISO()
      : period === 'week'
      ? 'This Week'
      : period === 'month'
      ? new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : customStart && customEnd
      ? `${customStart} → ${customEnd}`
      : 'All Time';

  const PERIODS: { id: Period; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div
            className="flex items-center gap-2 mb-1"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#52525b', letterSpacing: '0.15em', textTransform: 'uppercase' }}
          >
            <span style={{ display: 'inline-block', width: 14, height: 1, background: '#52525b', verticalAlign: 'middle' }} />
            Agent Performance
          </div>
          <h2
            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em' }}
          >
            {periodLabel}
          </h2>
        </div>

        {/* Period pills */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: '#18181c', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {PERIODS.map(p => (
            <PeriodBtn
              key={p.id}
              id={p.id}
              label={p.label}
              active={period === p.id}
              onClick={() => setPeriod(p.id)}
            />
          ))}
        </div>
      </div>

      {/* Custom date inputs */}
      {period === 'custom' && (
        <div
          className="flex items-center gap-3 flex-wrap p-4 rounded-xl"
          style={{ background: '#18181c', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <CalendarDays className="w-4 h-4" style={{ color: '#52525b' }} />
          <span style={{ fontSize: 12, color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>From</span>
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{
              background: '#09090b',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#f4f4f5',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
            }}
          />
          <ChevronDown className="w-3.5 h-3.5 -rotate-90" style={{ color: '#52525b' }} />
          <span style={{ fontSize: 12, color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>To</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{
              background: '#09090b',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#f4f4f5',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
            }}
          />
        </div>
      )}

      {/* Stats summary strip */}
      {metrics.length > 0 && (
        <div
          className="grid grid-cols-3 gap-px rounded-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {[
            { label: 'Total Calls', value: fmt(metrics.reduce((s, m) => s + m.calls, 0)) },
            { label: 'Meetings Booked', value: fmt(metrics.reduce((s, m) => s + m.booked, 0)) },
            {
              label: 'Avg Show Rate',
              value: (() => {
                const totalBooked = metrics.reduce((s, m) => s + m.booked, 0);
                const totalAttended = metrics.reduce((s, m) => s + m.attended, 0);
                return totalBooked > 0 ? fmtPct(totalAttended / totalBooked) : '—';
              })(),
            },
          ].map(stat => (
            <div key={stat.label} className="flex flex-col gap-1 px-6 py-4" style={{ background: '#121215' }}>
              <span
                style={{ fontSize: 9, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'JetBrains Mono', monospace" }}
              >
                {stat.label}
              </span>
              <span
                style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Agent cards grid */}
      {metrics.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{ background: '#121215', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Phone className="w-8 h-8 mb-3" style={{ color: '#3f3f46' }} />
          <p style={{ fontSize: 13, color: '#52525b', fontFamily: "'JetBrains Mono', monospace" }}>
            No activity in this period
          </p>
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
