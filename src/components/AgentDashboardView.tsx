'use client';

import React, { memo, useMemo, useState } from 'react';
import { Award, Phone } from 'lucide-react';
import { FilterState, OpenerStats } from '@/types/dashboard';

interface AgentDashboardViewProps {
  openers: OpenerStats[];
  filters: FilterState;
  /** Per-agent goals for the selected period, if targets are set. */
  agentGoals?: { calls: number; meetings: number; onboarded: number } | null;
  /** Qualified shows per agent in the month of the selected end date. */
  qualifiedMonth?: { month: string; byOpener: Record<string, number>; total: number };
  /** Monthly qualified-show target per agent. */
  monthlyTarget?: number;
}

type SortKey = 'calls' | 'booked' | 'qualifiedShows' | 'showRate' | 'closeRate';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'calls', label: 'Calls' },
  { id: 'booked', label: 'Booked' },
  { id: 'qualifiedShows', label: 'Qualified shows' },
  { id: 'showRate', label: 'Show rate' },
  { id: 'closeRate', label: 'Close rate' },
];

function formatRate(rate: number): string {
  return Number.isFinite(rate) && rate > 0 ? `${Math.round(rate * 100)}%` : '—';
}

function getPeriodTitle(filters: FilterState): string {
  if (filters.preset === 'yesterday') return `Yesterday · ${filters.startDate || ''}`;
  if (filters.preset === 'this_week') return 'This week';
  if (filters.preset === 'this_month') return 'This month';
  if (filters.preset === 'last_30_days') return 'Last 30 days';
  if (filters.startDate && filters.endDate) return `${filters.startDate} → ${filters.endDate}`;
  return 'Current period';
}

function coachingStatus(agent: OpenerStats): { label: string; className: string } {
  if (agent.calls === 0 && agent.booked === 0) return { label: 'No activity', className: '' };
  // Show rate is only judged once there are enough settled results: an unconfirmed meeting is neither a show nor a no-show yet.
  if (agent.attended + agent.noShow >= 3 && agent.awaitingConfirmation === 0 && agent.showRate < 0.4) return { label: 'Low show rate', className: 'pill-danger' };
  if (agent.presentDays > 0 && agent.callsPerPresentDay < 10) return { label: 'Low activity', className: 'pill-warn' };
  if (agent.awaitingConfirmation > 0) return { label: 'Shows to confirm', className: 'pill-warn' };
  return { label: 'On track', className: 'pill-success' };
}

type Tone = 'neutral' | 'gold' | 'success' | 'danger';
const TONE_TEXT: Record<Tone, string> = { neutral: 'text-white', gold: 'text-gold-light', success: 'text-success', danger: 'text-danger' };
const TONE_BAR: Record<Tone, string> = { neutral: 'bar-fill-white', gold: 'bar-fill-gold', success: 'bar-fill-success', danger: 'bar-fill-danger' };

function Metric({ label, value, ratio, tone = 'neutral', hint }: { label: string; value: string; ratio?: number; tone?: Tone; hint?: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="label-caps">{label}</div>
      <div className={`font-num text-2xl font-bold mt-1 ${TONE_TEXT[tone]}`}>{value}</div>
      {ratio !== undefined && <div className="bar-track mt-2" aria-hidden="true"><div className={`bar-fill ${TONE_BAR[tone]}`} style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} /></div>}
      {hint && <div className="text-[11px] text-text-dim mt-1.5">{hint}</div>}
    </div>
  );
}

const AgentCard = memo(function AgentCard({ agent, rank, maxCalls, maxBooked, teamShowRate, goals, monthQualified, monthLabel, monthlyTarget }: {
  goals?: { calls: number; meetings: number; onboarded: number } | null;
  monthQualified: number;
  monthLabel: string;
  monthlyTarget?: number;
  agent: OpenerStats;
  rank: number;
  maxCalls: number;
  maxBooked: number;
  teamShowRate: number;
}) {
  const isTop = rank === 1;
  const status = coachingStatus(agent);
  const productivity = agent.presentDays > 0
    ? `${agent.callsPerPresentDay} calls/day · ${agent.presentDays} present days`
    : `${agent.callsPerCalendarDay ?? 0} calls/calendar day`;
  const showDelta = agent.attended + agent.noShow > 0 && teamShowRate > 0 ? Math.round((agent.showRate - teamShowRate) * 100) : null;

  return (
    <article className={`card ${isTop ? 'card-gold' : ''} overflow-hidden`}>
      <header className="flex items-start justify-between gap-3 px-4 py-4 border-b border-white/6">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`font-num text-xs font-bold h-7 w-7 shrink-0 rounded-full flex items-center justify-center ${isTop ? 'bg-gold text-black' : 'bg-white/8 text-text-muted'}`} aria-label={`Rank ${rank}`}>
            {isTop ? <Award className="w-3.5 h-3.5" aria-hidden="true" /> : rank}
          </span>
          <div className="min-w-0">
            <h3 className="font-serif text-base font-bold text-white truncate">{agent.opener}</h3>
            <p className="text-xs text-text-dim mt-0.5">{productivity}{agent.awaitingConfirmation > 0 ? ` · ${agent.awaitingConfirmation} awaiting confirmation` : ''}</p>
          </div>
        </div>
        <span className={`pill ${status.className} shrink-0`}>{status.label}</span>
      </header>

      <div className="grid grid-cols-2 gap-px bg-white/5">
        <div className="col-span-2">
          <Metric label={`Qualified shows · ${monthLabel}`} value={monthQualified.toLocaleString()} tone={monthlyTarget && monthQualified >= monthlyTarget ? 'success' : 'gold'}
            ratio={monthlyTarget ? monthQualified / monthlyTarget : undefined}
            hint={`${monthlyTarget ? `${Math.round((monthQualified / monthlyTarget) * 100)}% of the ${monthlyTarget} monthly target · ` : 'No monthly target set · '}${agent.qualifiedShows} in the selected dates`} />
        </div>
        <Metric label="Calls" value={agent.calls.toLocaleString()} ratio={goals?.calls ? agent.calls / goals.calls : agent.calls / maxCalls}
          tone={goals?.calls && agent.calls >= goals.calls ? 'success' : 'neutral'} hint={goals?.calls ? `${Math.round((agent.calls / goals.calls) * 100)}% of ${goals.calls.toLocaleString()} target` : undefined} />
        <Metric label="Booked" value={agent.booked.toLocaleString()} ratio={goals?.meetings ? agent.booked / goals.meetings : agent.booked / maxBooked}
          tone={goals?.meetings && agent.booked >= goals.meetings ? 'success' : 'gold'} hint={goals?.meetings ? `${Math.round((agent.booked / goals.meetings) * 100)}% of ${goals.meetings} target` : undefined} />
        <Metric label="Show rate" value={formatRate(agent.showRate)} tone={agent.showRate >= 0.6 ? 'success' : agent.showRate >= 0.4 ? 'gold' : 'danger'}
          hint={showDelta === null ? `${agent.attended} attended · ${agent.noShow} no-show` : `${showDelta >= 0 ? '+' : ''}${showDelta} pts vs team · ${agent.attended}/${agent.attended + agent.noShow}`} />
        <Metric label="Close rate" value={formatRate(agent.closeRate)} tone={agent.closeRate >= 0.2 ? 'success' : 'neutral'} hint={goals?.onboarded ? `${agent.onboarded} of ${goals.onboarded} onboarded target` : `${agent.onboarded} onboarded`} />
      </div>

      <footer className="flex items-center justify-between px-4 py-2.5 text-xs text-text-dim border-t border-white/6">
        <span>Answer rate <span className="font-num text-text-muted">{formatRate(agent.answerRate)}</span></span>
        <span>Calls / meeting <span className="font-num text-text-muted">{agent.callsPerMeeting || '—'}</span></span>
      </footer>
    </article>
  );
});

export function AgentDashboardView({ openers, filters, agentGoals, qualifiedMonth, monthlyTarget }: AgentDashboardViewProps) {
  const monthLabel = qualifiedMonth ? new Date(`${qualifiedMonth.month}-01T12:00:00`).toLocaleString('en-US', { month: 'short' }) : 'month';
  const [sortKey, setSortKey] = useState<SortKey>('calls');

  const activeOpeners = useMemo(() => openers
    .filter((opener) => opener.opener && opener.opener !== 'undefined')
    .sort((a, b) => (b[sortKey] - a[sortKey]) || b.calls - a.calls || b.booked - a.booked), [openers, sortKey]);
  const maxCalls = useMemo(() => Math.max(1, ...activeOpeners.map((agent) => agent.calls)), [activeOpeners]);
  const maxBooked = useMemo(() => Math.max(1, ...activeOpeners.map((agent) => agent.booked)), [activeOpeners]);
  const teamShowRate = useMemo(() => {
    const attended = activeOpeners.reduce((n, a) => n + a.attended, 0);
    const noShow = activeOpeners.reduce((n, a) => n + a.noShow, 0);
    return attended + noShow > 0 ? attended / (attended + noShow) : 0;
  }, [activeOpeners]);

  return (
    <section aria-labelledby="team-performance-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="sec-tag mb-1">Team performance</p>
          <h2 id="team-performance-heading" className="font-serif text-xl font-bold text-white">{getPeriodTitle(filters)}</h2>
          <p className="text-xs text-text-dim mt-1">{activeOpeners.length} active agents</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-dim">Rank by</span>
          <div className="seg" role="group" aria-label="Rank agents by">
            {SORTS.map(s => (
              <button key={s.id} type="button" className="seg-item" aria-pressed={sortKey === s.id} onClick={() => setSortKey(s.id)}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>

      {activeOpeners.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20">
          <Phone className="w-8 h-8 mb-3 text-text-faint" />
          <p className="text-sm text-text-dim">No agent activity found in this period</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeOpeners.map((agent, index) => <AgentCard key={agent.opener} agent={agent} rank={index + 1} maxCalls={maxCalls} maxBooked={maxBooked} teamShowRate={teamShowRate} goals={agentGoals} monthQualified={qualifiedMonth?.byOpener[agent.opener] ?? 0} monthLabel={monthLabel} monthlyTarget={monthlyTarget} />)}
        </div>
      )}
    </section>
  );
}
