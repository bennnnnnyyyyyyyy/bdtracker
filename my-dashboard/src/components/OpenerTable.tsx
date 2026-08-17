'use client';

import React, { useState } from 'react';
import { Download, Search, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { OpenerStats, OrgTotals } from '@/types/dashboard';
import { CONFIG } from '@/lib/config';
import { formatMinutes, formatPercent } from '@/lib/analytics';

interface OpenerTableProps {
  openers: OpenerStats[];
  totals: OrgTotals;
}

type SortField = keyof OpenerStats | string;

export const OpenerTable: React.FC<OpenerTableProps> = ({ openers, totals }) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('calls');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filtered = openers.filter(o =>
    o.opener.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
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

  const exportCSV = () => {
    const headers = [
      'Opener', 'Calls Made', 'Outbound', 'Inbound', 'Answered', 'No Answer', 'Answer Rate',
      'Total Talk (min)', 'Avg Call (sec)', 'Meetings Booked', 'No-Show', 'Attended', 'Show Rate',
      'Onboarded', 'Close Rate', 'Calls per Meeting', ...CONFIG.BD_TABS
    ];

    const rows = sorted.map(o => [
      `"${o.opener}"`,
      o.calls,
      o.outbound,
      o.inbound,
      o.answered,
      o.noAnswer,
      `"${(o.answerRate * 100).toFixed(1)}%"`,
      Math.round(o.totalTalkSec / 60),
      o.avgCallSec,
      o.booked,
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
      totals.outbound,
      totals.inbound,
      totals.answered,
      totals.noAnswer,
      `"${(totals.answerRate * 100).toFixed(1)}%"`,
      Math.round(totals.totalTalkSec / 60),
      totals.avgCallSec,
      totals.booked,
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
    link.setAttribute('download', `BD_Dashboard_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-40 group-hover:opacity-100 transition-opacity ml-1 inline" />;
    }
    return sortAsc ? (
      <ChevronUp className="w-3.5 h-3.5 text-blue-400 ml-1 inline" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-blue-400 ml-1 inline" />
    );
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      {/* Table Toolbar */}
      <div className="p-4 sm:px-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Opener Breakdown Table</h3>
          <p className="text-xs text-slate-400">Complete performance metrics matching BD Dashboard tab</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search opener..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-800 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48"
            />
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-slate-800/80 text-slate-400 border-b border-slate-700/80 uppercase font-semibold">
            <tr>
              <th onClick={() => handleSort('opener')} className="py-3 px-4 cursor-pointer hover:text-white sticky left-0 bg-slate-800/95 z-10">
                Opener {renderSortIcon('opener')}
              </th>
              <th onClick={() => handleSort('calls')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Calls Made {renderSortIcon('calls')}
              </th>
              <th onClick={() => handleSort('outbound')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Out {renderSortIcon('outbound')}
              </th>
              <th onClick={() => handleSort('inbound')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                In {renderSortIcon('inbound')}
              </th>
              <th onClick={() => handleSort('answered')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Answered {renderSortIcon('answered')}
              </th>
              <th onClick={() => handleSort('noAnswer')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                No Answer {renderSortIcon('noAnswer')}
              </th>
              <th onClick={() => handleSort('answerRate')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Answer Rate {renderSortIcon('answerRate')}
              </th>
              <th onClick={() => handleSort('totalTalkSec')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Total Talk {renderSortIcon('totalTalkSec')}
              </th>
              <th onClick={() => handleSort('avgCallSec')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Avg Call {renderSortIcon('avgCallSec')}
              </th>
              <th onClick={() => handleSort('booked')} className="py-3 px-3 cursor-pointer hover:text-white text-right bg-blue-950/20 text-blue-300">
                Booked {renderSortIcon('booked')}
              </th>
              <th onClick={() => handleSort('noShow')} className="py-3 px-3 cursor-pointer hover:text-white text-right text-amber-300">
                No-Show {renderSortIcon('noShow')}
              </th>
              <th onClick={() => handleSort('attended')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Attended {renderSortIcon('attended')}
              </th>
              <th onClick={() => handleSort('showRate')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Show Rate {renderSortIcon('showRate')}
              </th>
              <th onClick={() => handleSort('onboarded')} className="py-3 px-3 cursor-pointer hover:text-white text-right bg-purple-950/20 text-purple-300">
                Onboarded {renderSortIcon('onboarded')}
              </th>
              <th onClick={() => handleSort('closeRate')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Close Rate {renderSortIcon('closeRate')}
              </th>
              <th onClick={() => handleSort('callsPerMeeting')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Calls / Mtg {renderSortIcon('callsPerMeeting')}
              </th>
              {CONFIG.BD_TABS.map(tab => (
                <th key={tab} onClick={() => handleSort(tab)} className="py-3 px-3 cursor-pointer hover:text-white text-right text-slate-400">
                  {tab} {renderSortIcon(tab)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {sorted.map((o) => (
              <tr key={o.opener} className="hover:bg-slate-800/40 transition-colors">
                <td className="py-2.5 px-4 font-medium text-white sticky left-0 bg-slate-900/95 z-10 border-r border-slate-800">
                  {o.opener}
                </td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-100">{o.calls.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-slate-400">{o.outbound}</td>
                <td className="py-2.5 px-3 text-right text-slate-400">{o.inbound}</td>
                <td className="py-2.5 px-3 text-right text-emerald-400">{o.answered}</td>
                <td className="py-2.5 px-3 text-right text-slate-500">{o.noAnswer}</td>
                <td className="py-2.5 px-3 text-right">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                    o.answerRate >= 0.5 ? 'bg-emerald-950/60 text-emerald-300' : 'text-slate-300'
                  }`}>
                    {formatPercent(o.answerRate)}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-slate-300">{formatMinutes(o.totalTalkSec)}</td>
                <td className="py-2.5 px-3 text-right text-slate-400">{o.avgCallSec}s</td>
                <td className="py-2.5 px-3 text-right font-bold text-blue-400 bg-blue-950/10">{o.booked}</td>
                <td className="py-2.5 px-3 text-right text-amber-400">{o.noShow}</td>
                <td className="py-2.5 px-3 text-right text-slate-200">{o.attended}</td>
                <td className="py-2.5 px-3 text-right font-medium text-indigo-400">{formatPercent(o.showRate)}</td>
                <td className="py-2.5 px-3 text-right font-bold text-purple-400 bg-purple-950/10">{o.onboarded}</td>
                <td className="py-2.5 px-3 text-right font-medium text-purple-300">{formatPercent(o.closeRate)}</td>
                <td className="py-2.5 px-3 text-right font-mono text-amber-300">{o.callsPerMeeting}</td>
                {CONFIG.BD_TABS.map(tab => (
                  <td key={tab} className="py-2.5 px-3 text-right text-slate-400">
                    {o.stageCounts[tab] || 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {/* Totals Footer Row */}
          <tfoot className="bg-slate-800/90 text-white font-bold border-t-2 border-slate-700">
            <tr>
              <td className="py-3 px-4 sticky left-0 bg-slate-800/95 z-10 border-r border-slate-700">
                TOTAL ({openers.length} Openers)
              </td>
              <td className="py-3 px-3 text-right text-white">{totals.calls.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-slate-300">{totals.outbound.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-slate-300">{totals.inbound.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-emerald-400">{totals.answered.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-slate-400">{totals.noAnswer.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-emerald-300">{formatPercent(totals.answerRate)}</td>
              <td className="py-3 px-3 text-right text-slate-200">{formatMinutes(totals.totalTalkSec)}</td>
              <td className="py-3 px-3 text-right text-slate-300">{totals.avgCallSec}s</td>
              <td className="py-3 px-3 text-right text-blue-400 bg-blue-950/30">{totals.booked.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-amber-400">{totals.noShow.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-white">{totals.attended.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-indigo-300">{formatPercent(totals.showRate)}</td>
              <td className="py-3 px-3 text-right text-purple-400 bg-purple-950/30">{totals.onboarded.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-purple-300">{formatPercent(totals.closeRate)}</td>
              <td className="py-3 px-3 text-right text-amber-300">{totals.callsPerMeeting}</td>
              {CONFIG.BD_TABS.map(tab => (
                <td key={tab} className="py-3 px-3 text-right text-slate-300">
                  {(totals.stageCounts[tab] || 0).toLocaleString()}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
