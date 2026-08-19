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
    <div className="card overflow-hidden">
      {/* Header & Filters */}
      <div className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <div className="sec-tag mb-0.5">Call Activity</div>
          <h3 className="font-serif text-base font-bold text-white">Call Log Drill-Down</h3>
          <p className="label-caps mt-0.5">{filtered.length} calls logged</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#71717a] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search call / agent..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#f4f4f5] placeholder-[#52525b] focus:outline-none w-44 font-num"
              style={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            className="rounded-lg px-2.5 py-1.5 text-xs text-[#a1a1aa] focus:outline-none font-num"
            style={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <option value="ALL">All Types</option>
            <option value="OUT-Bound">Outbound</option>
            <option value="IN-Bound">Inbound</option>
          </select>

          {/* Outcome Filter */}
          <select
            value={outcomeFilter}
            onChange={(e) => { setOutcomeFilter(e.target.value); setCurrentPage(1); }}
            className="rounded-lg px-2.5 py-1.5 text-xs text-[#a1a1aa] focus:outline-none font-num"
            style={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <option value="ALL">All Outcomes</option>
            <option value="ANSWERED">Answered</option>
            <option value="NO ANSWER">No Answer</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap font-num">
          <thead className="bg-[#111113] text-[#71717a] border-b border-[rgba(255,255,255,0.07)] font-medium">
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
          <tbody className="divide-y divide-[rgba(255,255,255,0.05)] text-[#d4d4d8]">
            {paginated.map((c, idx) => (
              <tr key={`${c.callId}-${idx}`} className="hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                <td className="py-2.5 px-4 text-[#71717a] text-[11px]">{c.callDate}</td>
                <td className="py-2.5 px-3 text-[#a1a1aa]">{c.callId}</td>
                <td className="py-2.5 px-3 font-medium text-white">{c.agent || '—'}</td>
                <td className="py-2.5 px-3 text-[#a1a1aa]">{c.opener}</td>
                <td className="py-2.5 px-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    c.type === 'OUT-Bound' ? 'pill-warn' : 'pill-success'
                  }`}>
                    {c.type === 'OUT-Bound' ? <PhoneOutgoing className="w-2.5 h-2.5 mr-1" /> : <PhoneIncoming className="w-2.5 h-2.5 mr-1" />}
                    {c.type}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    c.outcome === 'ANSWERED' ? 'pill-success' : 'pill-danger'
                  }`}>
                    {c.outcome}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-[#f4f4f5]">{c.duration}</td>
                <td className="py-2.5 px-3 text-[#71717a]">{c.from}</td>
                <td className="py-2.5 px-3 text-[#71717a]">{c.to}</td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-[#52525b] text-sm">
                  No call logs match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3 border-t border-[rgba(255,255,255,0.07)] flex items-center justify-between text-xs text-[#71717a] font-num">
        <span>Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} entries</span>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1 rounded-lg bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-30 text-[#f4f4f5] cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-1 rounded-lg bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-30 text-[#f4f4f5] cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

CallLogsView.displayName = 'CallLogsView';
