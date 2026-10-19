'use client';

import React, { useMemo, useState, memo } from 'react';
import { Download, Search, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { OpenerStats, OrgTotals } from '@/types/dashboard';
import { CONFIG } from '@/lib/config';
import { formatMinutes, formatPercent } from '@/lib/analytics';

function formatLocalDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


interface OpenerTableProps {
  openers: OpenerStats[];
  totals: OrgTotals;
}

type SortField = keyof OpenerStats | string;

type ColumnGroup = 'activity' | 'meetings' | 'pipeline';

interface Column {
  key: string;
  label: string;
  group: ColumnGroup;
  title?: string;
  strong?: boolean;
  cell: (o: OpenerStats) => React.ReactNode;
  total: (t: OrgTotals) => React.ReactNode;
  cellTitle?: (o: OpenerStats) => string;
  /** Numeric value used to highlight the best agent in this column (higher is better). Null = nothing to compare. */
  best?: (o: OpenerStats) => number | null;
  /** Colour class for a cell, e.g. red/green for rates. */
  tone?: (o: OpenerStats) => string;
  /** Draw a small bar under the number, relative to the largest value in the column. */
  bar?: (o: OpenerStats) => number;
}

const GROUPS: { id: ColumnGroup; label: string }[] = [
  { id: 'activity', label: 'Call activity' },
  { id: 'meetings', label: 'Meetings & closing' },
  { id: 'pipeline', label: 'Pipeline stages' },
];

const COLUMNS: Column[] = [
  { key: 'calls', label: 'Calls', group: 'activity', strong: true, best: o => o.calls || null, bar: o => o.calls, cell: o => o.calls.toLocaleString(), total: t => t.calls.toLocaleString() },
  { key: 'presentDays', label: 'Present days', group: 'activity', title: 'Weighted present days from Attendance Sheet', cell: o => o.presentDays > 0 ? o.presentDays : '—', total: t => t.totalPresentDays.toLocaleString() },
  { key: 'callsPerPresentDay', label: 'Calls / day', group: 'activity', strong: true, best: o => (o.presentDays > 0 ? o.callsPerPresentDay : null), tone: o => (o.presentDays > 0 && o.callsPerPresentDay < 10 ? 'text-warn' : ''), title: 'Total calls / present days', cell: o => o.presentDays > 0 ? o.callsPerPresentDay : '—', total: t => t.callsPerPresentDay },
  { key: 'outbound', label: 'Out', group: 'activity', cell: o => o.outbound, total: t => t.outbound.toLocaleString() },
  { key: 'inbound', label: 'In', group: 'activity', cell: o => o.inbound, total: t => t.inbound.toLocaleString() },
  { key: 'answered', label: 'Answered', group: 'activity', cell: o => o.answered, total: t => t.answered.toLocaleString() },
  { key: 'noAnswer', label: 'No answer', group: 'activity', cell: o => o.noAnswer, total: t => t.noAnswer.toLocaleString() },
  { key: 'answerRate', label: 'Answer %', group: 'activity', strong: true, best: o => (o.calls > 0 ? o.answerRate : null), cell: o => formatPercent(o.answerRate), total: t => formatPercent(t.answerRate) },
  { key: 'totalTalkSec', label: 'Talk time', group: 'activity', cell: o => formatMinutes(o.totalTalkSec), total: t => formatMinutes(t.totalTalkSec) },
  { key: 'avgCallSec', label: 'Avg call', group: 'activity', cell: o => `${o.avgCallSec}s`, total: t => `${t.avgCallSec}s` },
  { key: 'booked', label: 'Booked', group: 'meetings', strong: true, best: o => o.booked || null, bar: o => o.booked, cell: o => o.booked, total: t => t.booked.toLocaleString() },
  { key: 'medBRate', label: 'Med B %', group: 'meetings', title: 'Med B share of rated meetings (booked, excluding CANCELLED and DISQUALIFIED)', cell: o => o.ratedMeetings > 0 ? `${(o.medBRate || 0).toFixed(1)}%` : '—', total: t => t.ratedMeetings > 0 ? `${(t.medBRate || 0).toFixed(1)}%` : '—', cellTitle: o => `${o.medBCount || 0} Med B meetings` },
  { key: 'ppoRate', label: 'PPO %', group: 'meetings', title: 'PPO share of rated meetings (booked, excluding CANCELLED and DISQUALIFIED)', cell: o => o.ratedMeetings > 0 ? `${(o.ppoRate || 0).toFixed(1)}%` : '—', total: t => t.ratedMeetings > 0 ? `${(t.ppoRate || 0).toFixed(1)}%` : '—', cellTitle: o => `${o.ppoCount || 0} PPO meetings` },
  { key: 'attended', label: 'Attended', group: 'meetings', cell: o => o.attended, total: t => t.attended.toLocaleString() },
  { key: 'awaitingConfirmation', label: 'To confirm', group: 'meetings', title: 'Meetings waiting for management to confirm the show', cell: o => o.awaitingConfirmation || '—', total: t => t.awaitingConfirmation > 0 ? t.awaitingConfirmation.toLocaleString() : '—' },
  { key: 'noShow', label: 'No-show', group: 'meetings', cell: o => o.noShow, total: t => t.noShow.toLocaleString() },
  { key: 'showRate', label: 'Show %', group: 'meetings', strong: true, best: o => (o.attended + o.noShow >= 3 ? o.showRate : null), tone: o => (o.attended + o.noShow < 3 || o.awaitingConfirmation > 0 ? '' : o.showRate >= 0.6 ? 'text-success' : o.showRate < 0.4 ? 'text-danger' : ''), title: 'Attended ÷ (attended + no-show). Blank until a meeting has a result.', cell: o => o.attended + o.noShow > 0 ? formatPercent(o.showRate) : '—', total: t => t.attended + t.noShow > 0 ? formatPercent(t.showRate) : '—' },
  { key: 'onboarded', label: 'Onboarded', group: 'meetings', strong: true, best: o => o.onboarded || null, cell: o => o.onboarded, total: t => t.onboarded.toLocaleString() },
  { key: 'closeRate', label: 'Close %', group: 'meetings', strong: true, best: o => (o.ratedMeetings > 0 && o.onboarded > 0 ? o.closeRate : null), title: 'Onboarded ÷ rated meetings', cell: o => o.ratedMeetings > 0 ? formatPercent(o.closeRate) : '—', total: t => t.ratedMeetings > 0 ? formatPercent(t.closeRate) : '—' },
  { key: 'callsPerMeeting', label: 'Calls / meeting', group: 'meetings', cell: o => o.callsPerMeeting || '—', total: t => t.callsPerMeeting || '—' },
];

export const OpenerTable: React.FC<OpenerTableProps> = memo(({ openers, totals }) => {

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('calls');
  const [sortAsc, setSortAsc] = useState(false);
  const [visibleGroups, setVisibleGroups] = useState<Set<ColumnGroup>>(() => new Set<ColumnGroup>(['activity', 'meetings']));

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sorted = useMemo(() => {
    const searchLower = search.toLowerCase();
    const filtered = openers.filter(o =>
      o.opener.toLowerCase().includes(searchLower)
    );

    return [...filtered].sort((a, b) => {
      let valA: unknown;
      let valB: unknown;

      if (CONFIG.BD_TABS.includes(sortField as string)) {
        valA = a.stageCounts[sortField as string] || 0;
        valB = b.stageCounts[sortField as string] || 0;
      } else {
        valA = a[sortField as keyof OpenerStats];
        valB = b[sortField as keyof OpenerStats];
      }

      if (typeof valA === 'string') {
        return sortAsc
          ? (valA as string).localeCompare(valB as string)
          : (valB as string).localeCompare(valA as string);
      }

      const numA = (valA as number) || 0;
      const numB = (valB as number) || 0;
      return sortAsc ? numA - numB : numB - numA;
    });
  }, [openers, search, sortAsc, sortField]);

  const exportCSV = () => {
    const headers = [
      'Opener', 'Calls Made', 'Present Days', 'Calls / Pres. Day', 'Calls / Day (As-Is)', 'Outbound', 'Inbound', 'Answered', 'No Answer', 'Answer Rate',
      'Total Talk (min)', 'Avg Call (sec)', 'Meetings Booked', 'Med B Count', 'Med B %', 'PPO Count', 'PPO %', 'Awaiting Confirmation', 'No-Show', 'Attended', 'Show Rate',
      'Onboarded', 'Close Rate', 'Calls per Meeting', ...CONFIG.BD_TABS
    ];

    const rows = sorted.map(o => [
      `"${o.opener}"`,
      o.calls,
      o.presentDays,
      o.callsPerPresentDay,
      o.callsPerCalendarDay || 0,
      o.outbound,
      o.inbound,
      o.answered,
      o.noAnswer,
      `"${(o.answerRate * 100).toFixed(1)}%"`,
      Math.round(o.totalTalkSec / 60),
      o.avgCallSec,
      o.booked,
      o.medBCount || 0,
      `"${(o.medBRate || 0).toFixed(1)}%"`,
      o.ppoCount || 0,
      `"${(o.ppoRate || 0).toFixed(1)}%"`,
      o.awaitingConfirmation || 0,
      o.noShow,
      o.attended,
      `"${(o.showRate * 100).toFixed(1)}%"`,
      o.onboarded,
      `"${(o.closeRate * 100).toFixed(1)}%"`,
      o.callsPerMeeting,
      ...CONFIG.BD_TABS.map(tab => o.stageCounts[tab] || 0)
    ]);

    const totalsRow = [
      '"TOTAL"',
      totals.calls,
      totals.totalPresentDays,
      totals.callsPerPresentDay,
      totals.callsPerCalendarDay || 0,
      totals.outbound,
      totals.inbound,
      totals.answered,
      totals.noAnswer,
      `"${(totals.answerRate * 100).toFixed(1)}%"`,
      Math.round(totals.totalTalkSec / 60),
      totals.avgCallSec,
      totals.booked,
      totals.medBCount || 0,
      `"${(totals.medBRate || 0).toFixed(1)}%"`,
      totals.ppoCount || 0,
      `"${(totals.ppoRate || 0).toFixed(1)}%"`,
      totals.awaitingConfirmation || 0,
      totals.noShow,
      totals.attended,
      `"${(totals.showRate * 100).toFixed(1)}%"`,
      totals.onboarded,
      `"${(totals.closeRate * 100).toFixed(1)}%"`,
      totals.callsPerMeeting,
      ...CONFIG.BD_TABS.map(tab => totals.stageCounts[tab] || 0)
    ];

    const csvContent = [headers.join(','), ...rows.map(r => r.join(',')), totalsRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `BD_Dashboard_Report_${formatLocalDateYMD(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-80 transition-opacity ml-1 inline" />;
    }
    return sortAsc
      ? <ChevronUp className="w-3.5 h-3.5 text-gold-light ml-1 inline" />
      : <ChevronDown className="w-3.5 h-3.5 text-gold-light ml-1 inline" />;
  };

  const visibleColumns = COLUMNS.filter(c => visibleGroups.has(c.group));
  // Best value per column among the agents shown (only when at least two agents can be compared), and the largest bar value.
  const bestByCol = useMemo(() => {
    const out: Record<string, number> = {};
    COLUMNS.forEach(c => {
      if (!c.best) return;
      const vals = openers.map(o => c.best!(o)).filter((v): v is number => v !== null);
      if (vals.length >= 2) out[c.key] = Math.max(...vals);
    });
    return out;
  }, [openers]);
  const barMax = useMemo(() => {
    const out: Record<string, number> = {};
    COLUMNS.forEach(c => { if (c.bar) out[c.key] = Math.max(1, ...openers.map(o => c.bar!(o))); });
    return out;
  }, [openers]);
  const stageColumns = visibleGroups.has('pipeline') ? CONFIG.BD_TABS : [];

  const toggleGroup = (g: ColumnGroup) => setVisibleGroups(prev => {
    const next = new Set(prev);
    if (next.has(g)) next.delete(g); else next.add(g);
    return next;
  });

  const th = 'py-3 px-3 cursor-pointer hover:text-white text-right group select-none';

  return (
    <div className="card overflow-hidden">
      <div className="p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/7">
        <div>
          <div className="sec-tag mb-1">Summary report</div>
          <h3 className="font-serif text-lg font-bold text-white">Full agent breakdown</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Column groups" className="seg">
            {GROUPS.map(g => (
              <button
                key={g.id}
                type="button"
                aria-pressed={visibleGroups.has(g.id)}
                onClick={() => toggleGroup(g.id)}
                className="seg-item"
              >
                {g.label}
              </button>
            ))}
          </div>
          <label className="field">
            <Search className="w-3.5 h-3.5 text-text-dim" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search agent…"
              aria-label="Search agent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-36"
            />
          </label>
          <button
            onClick={exportCSV}
            className="btn btn-primary"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-dim border-b border-white/7">
        <span><strong className="font-num text-white">{openers.length}</strong> agents</span>
        <span><strong className="font-num text-white">{totals.calls.toLocaleString()}</strong> calls</span>
        <span><strong className="font-num text-white">{totals.booked.toLocaleString()}</strong> meetings</span>
        <span><strong className="font-num text-white">{totals.onboarded.toLocaleString()}</strong> onboarded</span>
        {totals.awaitingConfirmation > 0 && <span className="text-gold-light"><strong className="font-num">{totals.awaitingConfirmation}</strong> shows awaiting confirmation</span>}
        <span className="ml-auto"><span className="text-gold-light">Gold</span> = best in column · click a header to sort</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px] whitespace-nowrap font-num">
          <thead className="bg-surface text-text-dim text-[11px] uppercase tracking-wider border-b border-white/7 font-medium">
            <tr>
              <th onClick={() => handleSort('opener')} className="py-3 px-4 cursor-pointer hover:text-white sticky left-0 bg-surface z-10 group select-none">
                Agent {renderSortIcon('opener')}
              </th>
              {visibleColumns.map(c => (
                <th key={c.key} onClick={() => handleSort(c.key)} title={c.title} className={th}>
                  {c.label} {renderSortIcon(c.key)}
                </th>
              ))}
              {stageColumns.map(tab => (
                <th key={tab} onClick={() => handleSort(tab)} className={th}>
                  {tab} {renderSortIcon(tab)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-text-primary">
            {sorted.map((o, idx) => (
              <tr key={o.opener} className={`hover:bg-white/5 transition-colors ${idx % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
                <td className="py-3 px-4 font-semibold text-white sticky left-0 bg-card z-10 border-r border-white/6">
                  <span className="text-text-dim font-normal mr-2">{idx + 1}</span>{o.opener}
                </td>
                {visibleColumns.map(c => {
                  const bv = c.best?.(o);
                  const isBest = bv !== null && bv !== undefined && bestByCol[c.key] !== undefined && bv === bestByCol[c.key];
                  const tone = c.tone?.(o);
                  return (
                    <td key={c.key} className={`py-3 px-3 text-right ${isBest ? 'font-bold text-gold-light' : tone ? `font-bold ${tone}` : c.strong ? 'font-bold text-white' : 'text-text-muted'}`} title={c.cellTitle?.(o)}>
                      {c.cell(o)}
                      {c.bar && (
                        <div className="bar-track mt-1 !h-1" aria-hidden="true"><div className="bar-fill bar-fill-white" style={{ width: `${Math.min(100, (c.bar(o) / barMax[c.key]) * 100)}%` }} /></div>
                      )}
                    </td>
                  );
                })}
                {stageColumns.map(tab => (
                  <td key={tab} className="py-3 px-3 text-right text-text-muted">{o.stageCounts[tab] || 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface text-white font-bold border-t-2 border-white/12">
            <tr>
              <td className="py-3 px-4 sticky left-0 bg-surface z-10 border-r border-white/12">
                Total <span className="text-text-dim font-normal">({openers.length} agents)</span>
              </td>
              {visibleColumns.map(c => (
                <td key={c.key} className="py-3 px-3 text-right">{c.total(totals)}</td>
              ))}
              {stageColumns.map(tab => (
                <td key={tab} className="py-3 px-3 text-right">{(totals.stageCounts[tab] || 0).toLocaleString()}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
});

OpenerTable.displayName = 'OpenerTable';
