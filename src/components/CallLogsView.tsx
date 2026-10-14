'use client';

import React, { useMemo, useState, memo } from 'react';
import { PhoneIncoming, PhoneOutgoing, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { CallRecord } from '@/types/dashboard';

interface CallLogsViewProps {
  calls: CallRecord[];
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const CallLogsView: React.FC<CallLogsViewProps> = memo(({ calls }) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return calls.filter(c => {
      const matchesSearch =
        c.agent.toLowerCase().includes(searchLower) ||
        c.opener.toLowerCase().includes(searchLower) ||
        c.callId.toLowerCase().includes(searchLower) ||
        c.to.toLowerCase().includes(searchLower) ||
        c.from.toLowerCase().includes(searchLower);

      const matchesType = typeFilter === 'ALL' || c.type === typeFilter;
      const matchesOutcome = outcomeFilter === 'ALL' || c.outcome === outcomeFilter;

      return matchesSearch && matchesType && matchesOutcome;
    });
  }, [calls, outcomeFilter, search, typeFilter]);

  const answeredCount = useMemo(() => filtered.filter(c => c.outcome === 'ANSWERED').length, [filtered]);
  const talkSec = useMemo(() => filtered.reduce((n, c) => n + (c.durationSec || 0), 0), [filtered]);
  const totalPages = useMemo(() => Math.ceil(filtered.length / pageSize) || 1, [filtered.length]);
  const page = Math.min(currentPage, totalPages);
  const paginated = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [page, filtered]
  );

  return (
    <div className="card overflow-hidden">
      {/* Header & Filters */}
      <div className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <div className="sec-tag mb-1">Call activity</div>
          <h3 className="font-serif text-lg font-bold text-white">Call log drill-down</h3>
          <p className="text-xs text-text-dim mt-1">{filtered.length.toLocaleString()} calls · {answeredCount.toLocaleString()} answered ({filtered.length ? Math.round(answeredCount / filtered.length * 100) : 0}%) · {formatDuration(talkSec)} talk time</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#71717a] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search calls by agent, number, or ID"
               placeholder="Search call / agent..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="field pl-8 w-52"
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            className="field"
          >
            <option value="ALL">All Types</option>
            <option value="OUT-Bound">Outbound</option>
            <option value="IN-Bound">Inbound</option>
          </select>

          {/* Outcome Filter */}
          <select
            value={outcomeFilter}
            onChange={(e) => { setOutcomeFilter(e.target.value); setCurrentPage(1); }}
            className="field"
          >
            <option value="ALL">All Outcomes</option>
            <option value="ANSWERED">Answered</option>
            <option value="NO ANSWER">No Answer</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px] whitespace-nowrap font-num">
          <thead className="bg-surface text-text-dim text-[11px] uppercase tracking-wider border-b border-white/7 font-medium sticky top-0">
            <tr>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-3">Call ID</th>
              <th className="py-3 px-3">Extension agent</th>
              <th className="py-3 px-3">Agent (mapped)</th>
              <th className="py-3 px-3">Type</th>
              <th className="py-3 px-3">Outcome</th>
              <th className="py-3 px-3 text-right">Duration</th>
              <th className="py-3 px-3">From</th>
              <th className="py-3 px-3">To</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.05)] text-[#d4d4d8]">
            {paginated.map((c, idx) => (
              <tr key={`${c.callId}-${idx}`} className="hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                <td className="py-3 px-4 text-text-dim text-xs">{c.callDate}</td>
                <td className="py-3 px-3 text-[#a1a1aa]">{c.callId}</td>
                <td className="py-3 px-3 font-medium text-white">{c.agent || '—'}</td>
                <td className="py-3 px-3 text-[#a1a1aa]">{c.opener}</td>
                <td className="py-3 px-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    c.type === 'OUT-Bound' ? 'pill-warn' : 'pill-success'
                  }`}>
                    {c.type === 'OUT-Bound' ? <PhoneOutgoing className="w-2.5 h-2.5 mr-1" /> : <PhoneIncoming className="w-2.5 h-2.5 mr-1" />}
                    {c.type}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    c.outcome === 'ANSWERED' ? 'pill-success' : 'pill-danger'
                  }`}>
                    {c.outcome}
                  </span>
                </td>
                <td className="py-3 px-3 text-right text-[#f4f4f5]">{c.duration}</td>
                <td className="py-3 px-3 text-[#71717a]">{c.from}</td>
                <td className="py-3 px-3 text-[#71717a]">{c.to}</td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-text-dim text-sm">
                  No call logs match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3 border-t border-[rgba(255,255,255,0.07)] flex items-center justify-between text-xs text-[#71717a] font-num">
        <span>Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} entries</span>
        <div className="flex items-center gap-2">
          <span>Page {page} of {totalPages}</span>
          <button
            aria-label="Previous page"
            onClick={() => setCurrentPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="p-1.5 rounded-lg bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-30 text-[#f4f4f5] cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            aria-label="Next page"
            onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="p-1.5 rounded-lg bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-30 text-[#f4f4f5] cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

CallLogsView.displayName = 'CallLogsView';
