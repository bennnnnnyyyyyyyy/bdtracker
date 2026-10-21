'use client';

import React, { useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, UserX } from 'lucide-react';
import { MeetingRecord } from '@/types/dashboard';
import { isAwaitingConfirmation, isConfirmedShow } from '@/lib/meetings';

type Range = 'today' | 'yesterday' | 'week';
const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' },
];

function ymd(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

/** [start, end] dates for the chosen range; "yesterday" is the previous working day (Saturday and Sunday are off). */
function rangeDates(range: Range, now = new Date()): [string, string] {
  if (range === 'today') return [ymd(now), ymd(now)];
  if (range === 'yesterday') {
    const d = new Date(now);
    do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
    return [ymd(d), ymd(d)];
  }
  const monday = new Date(now);
  monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [ymd(monday), ymd(sunday)];
}

/** Meetings booked on the chosen days, straight from the tracker. Refreshes with the dashboard's live updates. */
export const TodayView: React.FC<{ meetings: MeetingRecord[]; dataAsOf?: string; pollFailed?: boolean }> = ({ meetings, dataAsOf, pollFailed }) => {
  const [range, setRange] = useState<Range>('today');
  const [start, end] = rangeDates(range);

  const rows = useMemo(() => meetings
    .filter((m) => m.dateAdded >= start && m.dateAdded <= end)
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded) || a.opener.localeCompare(b.opener) || (a.companyName || '').localeCompare(b.companyName || '')), [meetings, start, end]);

  const byOpener = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((m) => map.set(m.opener, (map.get(m.opener) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);

  const awaiting = rows.filter(isAwaitingConfirmation).length;
  const shows = rows.filter(isConfirmedShow).length;
  const noShows = rows.filter((m) => m.stage === 'No-Show').length;
  const asOf = dataAsOf ? new Date(dataAsOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  return (
    <section className="space-y-4" aria-labelledby="today-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sec-tag mb-1">Meetings</p>
          <h2 id="today-heading" className="font-serif text-xl font-bold text-white">{range === 'today' ? 'Booked today' : range === 'yesterday' ? 'Booked yesterday' : 'Booked this week'} · {start === end ? start : `${start} → ${end}`}</h2>
          <p className="text-xs mt-1 flex items-center gap-2 text-text-dim">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${pollFailed ? 'bg-warn' : 'bg-success animate-pulse'}`} aria-hidden="true" />
            {pollFailed ? 'Live updates paused' : 'Live: refreshes every 30 seconds'}{asOf ? ` · data as of ${asOf}` : ''} · ignores the date filter
          </p>
        </div>
        <div className="seg" role="group" aria-label="Day">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className="seg-item" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4"><div className="label-caps flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5" />Meetings booked</div><strong className="font-num text-3xl text-gold-light block mt-1">{rows.length}</strong></div>
        <div className="card p-4"><div className="label-caps">Shows (counted)</div><strong className="font-num text-3xl text-success block mt-1">{shows}</strong></div>
        <div className="card p-4"><div className="label-caps">No-shows</div><strong className="font-num text-3xl text-white block mt-1">{noShows}</strong></div>
        <div className="card p-4"><div className="label-caps">Awaiting decision</div><strong className="font-num text-3xl text-white block mt-1">{awaiting}</strong></div>
      </div>

      {byOpener.length > 0 && (
        <div className="card p-4 flex flex-wrap gap-2" aria-label="Meetings per agent">
          {byOpener.map(([opener, n]) => (
            <span key={opener} className="pill pill-success"><span className="font-semibold">{opener}</span><span className="font-num ml-1.5">{n}</span></span>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] whitespace-nowrap">
            <thead className="bg-surface text-text-dim text-[11px] uppercase tracking-wider border-b border-white/7">
              <tr><th className="py-3 px-4 text-left">Added</th><th className="py-3 px-3 text-left">Agent</th><th className="py-3 px-3 text-left">Company</th><th className="py-3 px-3 text-left">Contact</th><th className="py-3 px-3 text-left">Stage</th><th className="py-3 px-3 text-left">Result</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-text-primary">
              {rows.map((m) => (
                <tr key={m.meetingKey} className="hover:bg-white/3">
                  <td className="py-2.5 px-4 font-num text-text-dim text-xs">{m.dateAdded}</td>
                  <td className="py-2.5 px-3 font-semibold text-white">{m.opener}</td>
                  <td className="py-2.5 px-3">{m.companyName || '—'}{m.medB ? <span className="pill pill-warn ml-2">Med B</span> : null}{m.ppo ? <span className="pill pill-success ml-1">PPO</span> : null}</td>
                  <td className="py-2.5 px-3 text-text-muted">{m.authorizedPerson || '—'}</td>
                  <td className="py-2.5 px-3">{m.stage}{m.sheetStage ? <span className="text-text-dim"> (sheet: {m.sheetStage})</span> : null}</td>
                  <td className="py-2.5 px-3">
                    {m.decision === 'no_show' || m.stage === 'No-Show'
                      ? <span className="inline-flex items-center gap-1 text-[#fb923c]"><UserX className="w-3.5 h-3.5" />No-show</span>
                      : isConfirmedShow(m)
                        ? <span className="inline-flex items-center gap-1 text-[#4ade80]"><CheckCircle2 className="w-3.5 h-3.5" />Show</span>
                        : isAwaitingConfirmation(m)
                          ? <span className="text-[#e8c56a]">Awaiting decision</span>
                          : <span className="text-text-dim">Booked</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-text-dim text-sm">No meetings booked {range === 'week' ? 'this week' : range} yet. New rows in the tracker appear here within about a minute.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
