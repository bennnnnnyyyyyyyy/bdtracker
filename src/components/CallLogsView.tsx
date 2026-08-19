'use client';

import React, { useState, memo } from 'react';
import { PhoneIncoming, PhoneOutgoing, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { CallRecord } from '@/types/dashboard';

interface CallLogsViewProps {
  calls: CallRecord[];
}

export const CallLogsView: React.FC<CallLogsViewProps> = memo(({ calls }) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filtered = calls.filter(c => {
    const matchesSearch =
      c.agent.toLowerCase().includes(search.toLowerCase()) ||
      c.opener.toLowerCase().includes(search.toLowerCase()) ||
      c.callId.toLowerCase().includes(search.toLowerCase()) ||
      c.to.toLowerCase().includes(search.toLowerCase()) ||
      c.from.toLowerCase().includes(search.toLowerCase());

    const matchesType = typeFilter === 'ALL' || c.type === typeFilter;
    const matchesOutcome = outcomeFilter === 'ALL' || c.outcome === outcomeFilter;

    return matchesSearch && matchesType && matchesOutcome;
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      {/* Header & Filters */}
      <div className="p-4 sm:px-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Call Log Drill-Down</h3>
          <p className="text-xs text-slate-400">Recent raw Ultatel call activity ({filtered.length} matching)</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search call / agent..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="bg-slate-800 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none w-44"
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-800 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="ALL">All Types</option>
            <option value="OUT-Bound">Outbound</option>
            <option value="IN-Bound">Inbound</option>
          </select>

          {/* Outcome Filter */}
          <select
            value={outcomeFilter}
            onChange={(e) => { setOutcomeFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-800 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="ALL">All Outcomes</option>
            <option value="ANSWERED">Answered</option>
            <option value="NO ANSWER">No Answer</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-slate-800/80 text-slate-400 border-b border-slate-700/80 uppercase font-semibold">
            <tr>
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-3">Call ID</th>
              <th className="py-2.5 px-3">Agent</th>
              <th className="py-2.5 px-3">Mapped Opener</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3">Outcome</th>
              <th className="py-2.5 px-3 text-right">Duration</th>
              <th className="py-2.5 px-3">From</th>
              <th className="py-2.5 px-3">To</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {paginated.map((c, idx) => (
              <tr key={`${c.callId}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">{c.callDate}</td>
                <td className="py-2.5 px-3 font-mono text-slate-300">{c.callId}</td>
                <td className="py-2.5 px-3 font-medium text-slate-200">{c.agent || '—'}</td>
                <td className="py-2.5 px-3 text-slate-400">{c.opener}</td>
                <td className="py-2.5 px-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                    c.type === 'OUT-Bound' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {c.type === 'OUT-Bound' ? <PhoneOutgoing className="w-2.5 h-2.5 mr-1" /> : <PhoneIncoming className="w-2.5 h-2.5 mr-1" />}
                    {c.type}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                    c.outcome === 'ANSWERED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                  }`}>
                    {c.outcome}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-300">{c.duration}</td>
                <td className="py-2.5 px-3 text-slate-400 font-mono">{c.from}</td>
                <td className="py-2.5 px-3 text-slate-400 font-mono">{c.to}</td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500 text-sm">
                  No call logs match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <span>Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} entries</span>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

CallLogsView.displayName = 'CallLogsView';
