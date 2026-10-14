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
}

const GROUPS: { id: ColumnGroup; label: string }[] = [
  { id: 'activity', label: 'Call activity' },
  { id: 'meetings', label: 'Meetings & closing' },
  { id: 'pipeline', label: 'Pipeline stages' },
];

const COLUMNS: Column[] = [
  { key: 'calls', label: 'Calls', group: 'activity', strong: true, cell: o => o.calls.toLocaleString(), total: t => t.calls.toLocaleString() },
  { key: 'presentDays', label: 'Present days', group: 'activity', title: 'Weighted present days from Attendance Sheet', cell: o => o.presentDays > 0 ? o.presentDays : '—', total: t => t.totalPresentDays.toLocaleString() },
  { key: 'callsPerPresentDay', label: 'Calls / day', group: 'activity', strong: true, title: 'Total calls / present days', cell: o => o.presentDays > 0 ? o.callsPerPresentDay : '—', total: t => t.callsPerPresentDay },
  { key: 'outbound', label: 'Out', group: 'activity', cell: o => o.outbound, total: t => t.outbound.toLocaleString() },
  { key: 'inbound', label: 'In', group: 'activity', cell: o => o.inbound, total: t => t.inbound.toLocaleString() },
  { key: 'answered', label: 'Answered', group: 'activity', cell: o => o.answered, total: t => t.answered.toLocaleString() },
  { key: 'noAnswer', label: 'No answer', group: 'activity', cell: o => o.noAnswer, total: t => t.noAnswer.toLocaleString() },
  { key: 'answerRate', label: 'Answer %', group: 'activity', strong: true, cell: o => formatPercent(o.answerRate), total: t => formatPercent(t.answerRate) },
  { key: 'totalTalkSec', label: 'Talk time', group: 'activity', cell: o => formatMinutes(o.totalTalkSec), total: t => formatMinutes(t.totalTalkSec) },
  { key: 'avgCallSec', label: 'Avg call', group: 'activity', cell: o => `${o.avgCallSec}s`, total: t => `${t.avgCallSec}s` },
  { key: 'booked', label: 'Booked', group: 'meetings', strong: true, cell: o => o.booked, total: t => t.booked.toLocaleString() },
  { key: 'medBRate', label: 'Med B %', group: 'meetings', title: 'Med B share of booked meetings', cell: o => o.booked > 0 ? `${(o.medBRate || 0).toFixed(1)}%` : '—', total: t => t.booked > 0 ? `${(t.medBRate || 0).toFixed(1)}%` : '—', cellTitle: o => `${o.medBCount || 0} Med B meetings` },
  { key: 'ppoRate', label: 'PPO %', group: 'meetings', title: 'PPO share of booked meetings', cell: o => o.booked > 0 ? `${(o.ppoRate || 0).toFixed(1)}%` : '—', total: t => t.booked > 0 ? `${(t.ppoRate || 0).toFixed(1)}%` : '—', cellTitle: o => `${o.ppoCount || 0} PPO meetings` },
  { key: 'attended', label: 'Attended', group: 'meetings', cell: o => o.attended, total: t => t.attended.toLocaleString() },
  { key: 'noShow', label: 'No-show', group: 'meetings', cell: o => o.noShow, total: t => t.noShow.toLocaleString() },
  { key: 'showRate', label: 'Show %', group: 'meetings', strong: true, cell: o => formatPercent(o.showRate), total: t => formatPercent(t.showRate) },
  { key: 'onboarded', label: 'Onboarded', group: 'meetings', strong: true, cell: o => o.onboarded, total: t => t.onboarded.toLocaleString() },
  { key: 'closeRate', label: 'Close %', group: 'meetings', strong: true, cell: o => formatPercent(o.closeRate), total: t => formatPercent(t.closeRate) },
  { key: 'callsPerMeeting', label: 'Calls / meeting', group: 'meetings', cell: o => o.callsPerMeeting, total: t => t.callsPerMeeting },
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
      'Total Talk (min)', 'Avg Call (sec)', 'Meetings Booked', 'Med B Count', 'Med B %', 'PPO Count', 'PPO %', 'No-Show', 'Attended', 'Show Rate',
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
          <div role="group" aria-label="Column groups" className="flex gap-0.5 p-1 rounded-lg bg-white/4 border border-white/7">
            {GROUPS.map(g => (
              <button
                key={g.id}
                type="button"
                aria-pressed={visibleGroups.has(g.id)}
                onClick={() => toggleGroup(g.id)}
                className={`min-h-8 px-3 rounded-md text-xs font-semibold cursor-pointer transition-colors ${visibleGroups.has(g.id) ? 'bg-white text-black' : 'text-text-dim hover:text-text-primary'}`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-dim absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search agent…"
              aria-label="Search agent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg pl-8 pr-3 min-h-9 text-xs text-text-primary placeholder-text-dim focus:outline-none w-40 bg-base border border-white/10"
            />
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 min-h-9 rounded-lg cursor-pointer bg-gold-dim border border-gold-border text-gold-light"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
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
              <tr key={o.opener} className="hover:bg-white/3 transition-colors">
                <td className="py-3 px-4 font-semibold text-white sticky left-0 bg-card z-10 border-r border-white/6">
                  <span className="text-text-dim font-normal mr-2">{idx + 1}</span>{o.opener}
                </td>
                {visibleColumns.map(c => (
                  <td key={c.key} className={`py-3 px-3 text-right ${c.strong ? 'font-bold text-white' : 'text-text-muted'}`} title={c.cellTitle?.(o)}>
                    {c.cell(o)}
                  </td>
                ))}
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
