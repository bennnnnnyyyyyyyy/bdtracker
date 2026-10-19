'use client';

import React, { useMemo, useState, memo } from 'react';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { PeriodicGroupSummary } from '@/types/dashboard';
import { formatPercent } from '@/lib/analytics';

const PAGE_SIZE = 20;

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Calls per day and agent, from the uploaded Ultatel daily totals. This is the source of the call numbers. */
export const DailyCallsView: React.FC<{ daily: PeriodicGroupSummary[] }> = memo(({ daily }) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return daily
      .flatMap((d) => d.agents.map((a) => ({ day: d.periodKey, label: d.periodLabel, ...a })))
      .filter((r) => r.calls > 0 && (!q || r.opener.toLowerCase().includes(q)))
      .sort((a, b) => b.day.localeCompare(a.day) || b.calls - a.calls);
  }, [daily, search]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    calls: t.calls + r.calls, outbound: t.outbound + r.outbound, inbound: t.inbound + r.inbound, answered: t.answered + r.answered, noAnswer: t.noAnswer + r.noAnswer,
  }), { calls: 0, outbound: 0, inbound: 0, answered: 0, noAnswer: 0 }), [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const exportCsv = () => {
    const header = ['Day', 'Agent', 'Calls', 'Outbound', 'Inbound', 'Answered', 'No answer', 'Answer rate'];
    const lines = rows.map((r) => [r.day, r.opener, r.calls, r.outbound, r.inbound, r.answered, r.noAnswer, `${(r.connectionRate * 100).toFixed(1)}%`].map(csvCell).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Daily_Calls_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="card overflow-hidden">
      <div className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/7">
        <div>
          <div className="sec-tag mb-1">Call activity</div>
          <h3 className="font-serif text-lg font-bold text-white">Daily call totals</h3>
          <p className="text-xs text-text-dim mt-1">{totals.calls.toLocaleString()} calls · {totals.answered.toLocaleString()} answered ({totals.calls ? Math.round((totals.answered / totals.calls) * 100) : 0}%) · from the uploaded Ultatel daily reports</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="field">
            <Search className="w-3.5 h-3.5 text-text-dim" aria-hidden="true" />
            <input type="text" aria-label="Search agent" placeholder="Search agent…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-36" />
          </label>
          <button onClick={exportCsv} disabled={rows.length === 0} className="btn btn-primary"><Download className="w-3.5 h-3.5" />Export CSV</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px] whitespace-nowrap font-num">
          <thead className="bg-surface text-text-dim text-[11px] uppercase tracking-wider border-b border-white/7 font-medium">
            <tr>
              <th className="py-3 px-4">Day</th><th className="py-3 px-3">Agent</th>
              <th className="py-3 px-3 text-right">Calls</th><th className="py-3 px-3 text-right">Out</th><th className="py-3 px-3 text-right">In</th>
              <th className="py-3 px-3 text-right">Answered</th><th className="py-3 px-3 text-right">No answer</th><th className="py-3 px-3 text-right">Answer %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-text-primary">
            {pageRows.map((r) => (
              <tr key={`${r.day}-${r.opener}`} className="hover:bg-white/3">
                <td className="py-2.5 px-4 text-text-dim text-xs">{r.day}</td>
                <td className="py-2.5 px-3 font-medium text-white">{r.opener}</td>
                <td className="py-2.5 px-3 text-right font-bold text-white">{r.calls.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-text-muted">{r.outbound.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-text-muted">{r.inbound.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-text-muted">{r.answered.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-text-muted">{r.noAnswer.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-text-muted">{formatPercent(r.connectionRate)}</td>
              </tr>
            ))}
            {pageRows.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-text-dim text-sm">No calls in this period.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-surface text-white font-bold border-t-2 border-white/12">
              <tr>
                <td className="py-3 px-4" colSpan={2}>Total (all pages)</td>
                <td className="py-3 px-3 text-right">{totals.calls.toLocaleString()}</td>
                <td className="py-3 px-3 text-right">{totals.outbound.toLocaleString()}</td>
                <td className="py-3 px-3 text-right">{totals.inbound.toLocaleString()}</td>
                <td className="py-3 px-3 text-right">{totals.answered.toLocaleString()}</td>
                <td className="py-3 px-3 text-right">{totals.noAnswer.toLocaleString()}</td>
                <td className="py-3 px-3 text-right">{formatPercent(totals.calls ? totals.answered / totals.calls : 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-3 border-t border-white/7 flex items-center justify-between text-xs text-text-dim">
          <span>{rows.length} rows</span>
          <div className="flex items-center gap-2">
            <button aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)} className="p-1.5 rounded bg-elevated border border-white/10 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            <span>Page {current} of {totalPages}</span>
            <button aria-label="Next page" disabled={current >= totalPages} onClick={() => setPage(current + 1)} className="p-1.5 rounded bg-elevated border border-white/10 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
});

DailyCallsView.displayName = 'DailyCallsView';
