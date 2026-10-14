'use client';

import React, { useState, useMemo, memo } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { PeriodicGroupSummary } from '@/types/dashboard';
import { formatPercent } from '@/lib/analytics';

interface PeriodicBreakdownTableProps {
  data: PeriodicGroupSummary[];
  emptyLabel?: string;
  pageSize?: number;
}

interface MetricCol {
  key: string;
  label: string;
  color: string;
  isRate?: boolean;
}

const METRIC_COLS: MetricCol[] = [
  { key: 'calls', label: 'Calls', color: 'text-text-muted' },
  { key: 'presentDays', label: 'Pres. Days', color: 'text-text-muted' },
  { key: 'callsPerPresentDay', label: 'Calls / Day', color: 'text-text-muted' },
  { key: 'connectionRate', label: 'Connection %', color: 'text-text-muted', isRate: true },
  { key: 'noAnswer', label: 'No Answer', color: 'text-text-muted' },
  { key: 'meetings', label: 'Meetings', color: 'text-text-muted' },
  { key: 'showRate', label: 'Show %', color: 'text-text-muted', isRate: true },
  { key: 'onboarded', label: 'Closed', color: 'text-text-muted' },
  { key: 'closeRate', label: 'Close %', color: 'text-text-muted', isRate: true },
];

type MetricKey = string;

export const PeriodicBreakdownTable: React.FC<PeriodicBreakdownTableProps> = memo(({
  data,
  emptyLabel = 'No data',
  pageSize = 20
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([data[0]?.periodKey ?? '']));
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(data.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, currentPage, pageSize]);

  if (!data || data.length === 0) {
    return (
      <div className="card p-8 text-center text-text-dim text-sm">
        {emptyLabel}
      </div>
    );
  }

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getVal = (obj: Record<string, unknown>, key: MetricKey, isRate?: boolean): string => {
    const v = (obj[key] as number) ?? 0;
    if (key === 'presentDays') return v > 0 ? String(v) : '—';
    if (key === 'callsPerPresentDay') return v > 0 ? String(v) : '—';
    return isRate ? formatPercent(v) : v.toLocaleString();
  };

  const handleKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(key);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] whitespace-nowrap font-num">
          <thead className="bg-surface text-text-dim text-[11px] uppercase tracking-wider font-medium border-b border-white/7">
            <tr>
              <th scope="col" className="py-3 px-4 text-left sticky left-0 bg-surface z-10">Period / Agent</th>
              {METRIC_COLS.map(c => (
                <th key={c.key} scope="col" className={`py-3 px-3 text-right ${c.color}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-text-primary">
            {paginatedData.map(period => {
              const isOpen = expanded.has(period.periodKey);
              return (
                <React.Fragment key={period.periodKey}>
                  {/* Period header row */}
                  <tr
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    aria-label={`Toggle ${period.periodLabel} breakdown`}
                    className="cursor-pointer hover:bg-white/5 transition-colors bg-elevated/60"
                    onClick={() => toggle(period.periodKey)}
                    onKeyDown={(e) => handleKeyDown(e, period.periodKey)}
                  >
                    <td className="py-3 px-4 font-semibold text-white sticky left-0 bg-elevated z-10 border-r border-white/8">
                      <div className="flex items-center gap-2">
                        {isOpen
                          ? <ChevronDown className="w-3.5 h-3.5 text-gold-light shrink-0" aria-hidden="true" />
                          : <ChevronRight className="w-3.5 h-3.5 text-text-dim shrink-0" aria-hidden="true" />
                        }
                        <span className="text-white">{period.periodLabel}</span>
                        <span className="text-text-dim font-normal text-[11px]">({period.agents.length} agents)</span>
                      </div>
                    </td>
                    {METRIC_COLS.map(c => (
                      <td key={c.key} className={`py-3 px-3 text-right font-bold text-white`}>
                        {getVal(period.totals as unknown as Record<string, unknown>, c.key, c.isRate)}
                      </td>
                    ))}
                  </tr>

                  {/* Agent detail rows */}
                  {isOpen && period.agents.map(agent => (
                    <tr key={`${period.periodKey}-${agent.opener}`} className="hover:bg-white/3 transition-colors">
                      <td className="py-2 px-4 sticky left-0 bg-card z-10 border-r border-white/6">
                        <span className="pl-6 text-text-primary font-medium">{agent.opener}</span>
                      </td>
                      {METRIC_COLS.map(c => (
                        <td key={c.key} className={`py-2 px-3 text-right text-text-muted`}>
                          {getVal(agent as unknown as Record<string, unknown>, c.key, c.isRate)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer if > 1 page */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-white/7 flex items-center justify-between text-xs text-text-dim bg-surface">
          <span>
            Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, data.length)} of {data.length} periods
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded bg-elevated border border-white/10 disabled:opacity-30 hover:bg-hover cursor-pointer"
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded bg-elevated border border-white/10 disabled:opacity-30 hover:bg-hover cursor-pointer"
              aria-label="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

PeriodicBreakdownTable.displayName = 'PeriodicBreakdownTable';
