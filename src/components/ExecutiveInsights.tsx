'use client';

import React, { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CalendarCheck, CircleAlert, Phone, UserRoundX, UsersRound } from 'lucide-react';
import { FunnelSummary, OpenerStats, PeriodicGroupSummary } from '@/types/dashboard';

interface ExecutiveInsightsProps {
  funnel: FunnelSummary;
  openers: OpenerStats[];
  weeklyBreakdown: PeriodicGroupSummary[];
}

function rate(value: number, hasDenominator: boolean): string {
  return hasDenominator ? `${Math.round(value * 100)}%` : '—';
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

type Exception = { opener: string; reason: string; tone: 'danger' | 'warn' };

export function ExecutiveInsights({ funnel, openers, weeklyBreakdown }: ExecutiveInsightsProps) {
  const exceptions = useMemo(() => {
    const active = openers.filter(agent => agent.calls > 0 || agent.booked > 0);
    const avgCalls = average(active.map(agent => agent.calls));
    const avgAnswered = average(active.map(agent => agent.answered));
    const avgBooked = average(active.map(agent => agent.booked));
    const avgConnection = average(active.filter(agent => agent.calls > 0).map(agent => agent.connectionRate));
    const avgBooking = average(active.filter(agent => agent.answered > 0).map(agent => agent.bookingRate));
    const avgShow = average(active.filter(agent => agent.booked > 0).map(agent => agent.showRate));
    const avgCallsPerDay = average(active.filter(agent => agent.presentDays > 0).map(agent => agent.callsPerPresentDay));
    const found: Exception[] = [];

    active.forEach(agent => {
      if (agent.presentDays === 0) found.push({ opener: agent.opener, reason: 'No present-day attendance data', tone: 'warn' });
      if (agent.calls >= avgCalls && agent.calls > 0 && agent.connectionRate < avgConnection) {
        found.push({ opener: agent.opener, reason: `Connect rate ${rate(agent.connectionRate, true)} is below team pace`, tone: 'danger' });
      } else if (agent.answered >= avgAnswered && agent.answered > 0 && agent.bookingRate < avgBooking) {
        found.push({ opener: agent.opener, reason: `Booking rate ${rate(agent.bookingRate, true)} is below team pace`, tone: 'danger' });
      } else if (agent.booked >= avgBooked && agent.booked > 0 && agent.showRate < avgShow) {
        found.push({ opener: agent.opener, reason: `Show rate ${rate(agent.showRate, true)} is below team pace`, tone: 'danger' });
      } else if (agent.presentDays > 0 && agent.callsPerPresentDay < avgCallsPerDay) {
        found.push({ opener: agent.opener, reason: `${agent.callsPerPresentDay} calls per present day is below team pace`, tone: 'warn' });
      } else if (agent.booked > 0 && agent.onboarded === 0) {
        found.push({ opener: agent.opener, reason: `${agent.booked} booked meeting${agent.booked === 1 ? '' : 's'} with no onboarded outcome`, tone: 'warn' });
      }
    });

    return found.slice(0, 5);
  }, [openers]);

  const trendRows = useMemo(() => weeklyBreakdown.slice(0, 6).reverse(), [weeklyBreakdown]);
  const trendMax = useMemo(() => Math.max(1, ...trendRows.map(row => row.totals.calls)), [trendRows]);
  const stages = [
    { label: 'Calls', value: funnel.calls, stepRate: null, overallRate: null, icon: Phone },
    { label: 'Answered', value: funnel.answered, stepRate: funnel.connectionRate, overallRate: funnel.connectionRate, icon: UsersRound },
    { label: 'Booked', value: funnel.booked, stepRate: funnel.bookingRate, overallRate: funnel.calls > 0 ? funnel.booked / funnel.calls : 0, icon: CalendarCheck },
    { label: 'Attended', value: funnel.attended, stepRate: funnel.showRate, overallRate: funnel.calls > 0 ? funnel.attended / funnel.calls : 0, icon: UsersRound },
    { label: 'Onboarded', value: funnel.onboarded, stepRate: funnel.attended > 0 ? funnel.onboarded / funnel.attended : 0, overallRate: funnel.calls > 0 ? funnel.onboarded / funnel.calls : 0, icon: CalendarCheck },
  ];

  return (
    <section className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-5" aria-label="Executive insights">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div><div className="sec-tag mb-1">Executive funnel</div><h2 className="font-serif text-xl font-bold text-white">From outreach to onboarding</h2></div>
          <span className="pill pill-success">Live funnel</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const priorValue = index > 0 ? stages[index - 1].value : 0;
            return (
              <React.Fragment key={stage.label}>
                <div className="rounded-xl p-3 bg-black/20 border border-white/6 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 label-caps"><Icon className="w-3 h-3" />{stage.label}</div>
                  <div className="font-num text-2xl font-bold text-white mt-2">{stage.value.toLocaleString()}</div>
                  {stage.stepRate !== null ? <div className="font-num text-[10px] text-text-dim mt-1">{rate(stage.stepRate, priorValue > 0)} from prior · {rate(stage.overallRate || 0, funnel.calls > 0)} overall</div> : <div className="font-num text-[10px] text-text-dim mt-1">Starting volume</div>}
                </div>
                {index < stages.length - 1 && <ArrowRight className="hidden sm:block w-4 h-4 self-center text-gold shrink-0" aria-hidden="true" />}
              </React.Fragment>
            );
          })}
        </div>
        <div className="mt-5 border-t border-white/6 pt-4">
          <div className="flex items-center justify-between mb-3"><div className="sec-tag">Weekly performance</div><span className="label-caps">Latest six weeks</span></div>
          {trendRows.length === 0 ? <p className="text-sm text-text-dim">No weekly activity in this period.</p> : <div className="space-y-2">{trendRows.map(row => <div key={row.periodKey} className="grid grid-cols-[72px_1fr] lg:grid-cols-[72px_1fr_auto] items-center gap-3 text-xs font-num"><span className="text-text-dim truncate">{row.periodLabel}</span><div className="bar-track"><div className="bar-fill bar-fill-gold" style={{ width: `${(row.totals.calls / trendMax) * 100}%` }} /></div><span className="col-span-2 lg:col-span-1 text-text-primary lg:text-right">{row.totals.calls} calls · {rate(row.totals.connectionRate, row.totals.calls > 0)} connect · {row.totals.meetings} booked · {rate(row.totals.showRate, row.totals.meetings > 0)} show · {row.totals.onboarded} onboarded · {row.totals.presentDays ? row.totals.callsPerPresentDay : '—'} / day</span></div>)}</div>}
        </div>
      </div>

      <aside className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-5"><div><div className="sec-tag mb-1">Attention needed</div><h2 className="font-serif text-xl font-bold text-white">Operational exceptions</h2></div><CircleAlert className="w-5 h-5 text-gold-light shrink-0" /></div>
        {exceptions.length === 0 ? <div className="rounded-xl border border-success-border bg-success-dim p-4 text-sm text-success">No material exceptions in the selected period.</div> : <div className="space-y-2">{exceptions.map((exception, index) => <div key={`${exception.opener}-${index}`} className="rounded-xl border border-white/6 bg-black/15 p-3 flex gap-3">{exception.tone === 'danger' ? <AlertTriangle className="w-4 h-4 mt-0.5 text-danger shrink-0" /> : <UserRoundX className="w-4 h-4 mt-0.5 text-gold-light shrink-0" />}<div><div className="text-sm font-semibold text-white">{exception.opener}</div><p className="text-xs text-text-dim mt-0.5 leading-relaxed">{exception.reason}</p></div></div>)}</div>}
      </aside>
    </section>
  );
}
