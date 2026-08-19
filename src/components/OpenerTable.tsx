'use client';

import React, { useState, memo } from 'react';
import { Download, Search, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { OpenerStats, OrgTotals } from '@/types/dashboard';
import { CONFIG } from '@/lib/config';
import { formatMinutes, formatPercent } from '@/lib/analytics';

interface OpenerTableProps {
  openers: OpenerStats[];
  totals: OrgTotals;
}

type SortField = keyof OpenerStats | string;

export const OpenerTable: React.FC<OpenerTableProps> = memo(({ openers, totals }) => {

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
    <div className="card overflow-hidden">
      {/* Header with Search and Export */}
      <div className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <div className="sec-tag mb-0.5">Summary Report</div>
          <h3 className="font-serif text-base font-bold text-white">Full Agent Breakdown</h3>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#71717a] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search opener..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#f4f4f5] placeholder-[#52525b] focus:outline-none w-44 font-num"
              style={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
            style={{ background: '#1a1608', border: '1px solid rgba(201,168,76,0.3)', color: '#e8c56a' }}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap font-num">
          <thead className="bg-[#111113] text-[#71717a] border-b border-[rgba(255,255,255,0.07)] font-medium">
            <tr>
              <th onClick={() => handleSort('opener')} className="py-3 px-4 cursor-pointer hover:text-white sticky left-0 bg-[#111113] z-10 font-serif">
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
              <th onClick={() => handleSort('booked')} className="py-3 px-3 cursor-pointer hover:text-white text-right text-[#e8c56a]">
                Booked {renderSortIcon('booked')}
              </th>
              <th onClick={() => handleSort('noShow')} className="py-3 px-3 cursor-pointer hover:text-white text-right text-[#f87171]">
                No-Show {renderSortIcon('noShow')}
              </th>
              <th onClick={() => handleSort('attended')} className="py-3 px-3 cursor-pointer hover:text-white text-right text-[#4ade80]">
                Attended {renderSortIcon('attended')}
              </th>
              <th onClick={() => handleSort('showRate')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Show Rate {renderSortIcon('showRate')}
              </th>
              <th onClick={() => handleSort('onboarded')} className="py-3 px-3 cursor-pointer hover:text-white text-right text-[#c9a84c]">
                Onboarded {renderSortIcon('onboarded')}
              </th>
              <th onClick={() => handleSort('closeRate')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Close Rate {renderSortIcon('closeRate')}
              </th>
              <th onClick={() => handleSort('callsPerMeeting')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                Calls / Mtg {renderSortIcon('callsPerMeeting')}
              </th>
              {CONFIG.BD_TABS.map(tab => (
                <th key={tab} onClick={() => handleSort(tab)} className="py-3 px-3 cursor-pointer hover:text-white text-right text-[#71717a]">
                  {tab} {renderSortIcon(tab)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.05)] text-[#d4d4d8]">
            {sorted.map((o) => (
              <tr key={o.opener} className="hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                <td className="py-2.5 px-4 font-serif font-medium text-white sticky left-0 bg-[#17171a] z-10 border-r border-[rgba(255,255,255,0.06)]">
                  {o.opener}
                </td>
                <td className="py-2.5 px-3 text-right font-semibold text-white">{o.calls.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-[#71717a]">{o.outbound}</td>
                <td className="py-2.5 px-3 text-right text-[#71717a]">{o.inbound}</td>
                <td className="py-2.5 px-3 text-right text-[#4ade80]">{o.answered}</td>
                <td className="py-2.5 px-3 text-right text-[#52525b]">{o.noAnswer}</td>
                <td className="py-2.5 px-3 text-right">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                    o.answerRate >= 0.5 ? 'pill-success' : 'text-[#a1a1aa]'
                  }`}>
                    {formatPercent(o.answerRate)}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-[#a1a1aa]">{formatMinutes(o.totalTalkSec)}</td>
                <td className="py-2.5 px-3 text-right text-[#71717a]">{o.avgCallSec}s</td>
                <td className="py-2.5 px-3 text-right font-bold text-[#e8c56a]">{o.booked}</td>
                <td className="py-2.5 px-3 text-right text-[#f87171]">{o.noShow}</td>
                <td className="py-2.5 px-3 text-right text-[#4ade80]">{o.attended}</td>
                <td className="py-2.5 px-3 text-right font-medium text-[#e8c56a]">{formatPercent(o.showRate)}</td>
                <td className="py-2.5 px-3 text-right font-bold text-[#c9a84c]">{o.onboarded}</td>
                <td className="py-2.5 px-3 text-right font-medium text-[#c9a84c]">{formatPercent(o.closeRate)}</td>
                <td className="py-2.5 px-3 text-right text-[#e8c56a]">{o.callsPerMeeting}</td>
                {CONFIG.BD_TABS.map(tab => (
                  <td key={tab} className="py-2.5 px-3 text-right text-[#71717a]">
                    {o.stageCounts[tab] || 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {/* Totals Footer Row */}
          <tfoot className="bg-[#111113] text-white font-bold border-t-2 border-[rgba(255,255,255,0.12)]">
            <tr>
              <td className="py-3 px-4 font-serif sticky left-0 bg-[#111113] z-10 border-r border-[rgba(255,255,255,0.12)]">
                TOTAL ({openers.length} Openers)
              </td>
              <td className="py-3 px-3 text-right text-white">{totals.calls.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-[#a1a1aa]">{totals.outbound.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-[#a1a1aa]">{totals.inbound.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-[#4ade80]">{totals.answered.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-[#52525b]">{totals.noAnswer.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-[#4ade80]">{formatPercent(totals.answerRate)}</td>
              <td className="py-3 px-3 text-right text-[#d4d4d8]">{formatMinutes(totals.totalTalkSec)}</td>
              <td className="py-3 px-3 text-right text-[#a1a1aa]">{totals.avgCallSec}s</td>
              <td className="py-3 px-3 text-right text-[#e8c56a]">{totals.booked.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-[#f87171]">{totals.noShow.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-[#4ade80]">{totals.attended.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-[#e8c56a]">{formatPercent(totals.showRate)}</td>
              <td className="py-3 px-3 text-right text-[#c9a84c]">{totals.onboarded.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-[#c9a84c]">{formatPercent(totals.closeRate)}</td>
              <td className="py-3 px-3 text-right text-[#e8c56a]">{totals.callsPerMeeting}</td>
              {CONFIG.BD_TABS.map(tab => (
                <td key={tab} className="py-3 px-3 text-right text-[#a1a1aa]">
                  {(totals.stageCounts[tab] || 0).toLocaleString()}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
});

OpenerTable.displayName = 'OpenerTable';

