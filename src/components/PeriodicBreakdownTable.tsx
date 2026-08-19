'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PeriodicGroupSummary } from '@/types/dashboard';
import { formatPercent } from '@/lib/analytics';

interface PeriodicBreakdownTableProps {
  data: PeriodicGroupSummary[];
  emptyLabel?: string;
}

interface MetricCol {
  key: string;
  label: string;
  color: string;
  isRate?: boolean;
}

const METRIC_COLS: MetricCol[] = [
  { key: 'calls', label: 'Calls', color: 'text-blue-300' },
  { key: 'connectionRate', label: 'Connection %', color: 'text-cyan-300', isRate: true },
  { key: 'meetings', label: 'Meetings', color: 'text-indigo-300' },
  { key: 'showRate', label: 'Show %', color: 'text-emerald-300', isRate: true },
  { key: 'onboarded', label: 'Closed', color: 'text-purple-300' },
  { key: 'closeRate', label: 'Close %', color: 'text-purple-400', isRate: true },
];

type MetricKey = string;

export const PeriodicBreakdownTable: React.FC<PeriodicBreakdownTableProps> = ({ data, emptyLabel = 'No data' }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set([data[0]?.periodKey ?? '']));

  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-sm">
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
    return isRate ? formatPercent(v) : v.toLocaleString();
  };

  const handleKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(key);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-slate-800/80 text-slate-400 uppercase font-semibold border-b border-slate-700/80">
            <tr>
              <th scope="col" className="py-3 px-4 text-left sticky left-0 bg-slate-800/95 z-10">Period / Agent</th>
              {METRIC_COLS.map(c => (
                <th key={c.key} scope="col" className={`py-3 px-3 text-right ${c.color}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {data.map(period => {
              const isOpen = expanded.has(period.periodKey);
              return (
                <React.Fragment key={period.periodKey}>
                  {/* Period header row */}
                  <tr
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    aria-label={`Toggle ${period.periodLabel} breakdown`}
                    className="cursor-pointer hover:bg-slate-800/50 focus:bg-slate-800/60 focus:outline-none transition-colors bg-slate-800/30"
                    onClick={() => toggle(period.periodKey)}
                    onKeyDown={(e) => handleKeyDown(e, period.periodKey)}
                  >
                    <td className="py-3 px-4 font-semibold text-white sticky left-0 bg-slate-800/60 z-10 border-r border-slate-700">
                      <div className="flex items-center gap-2">
                        {isOpen
                          ? <ChevronDown className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-hidden="true" />
                          : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                        }
                        <span className="text-slate-100">{period.periodLabel}</span>
                        <span className="text-slate-500 font-normal text-[10px]">({period.agents.length} agents)</span>
                      </div>
                    </td>
                    {METRIC_COLS.map(c => (
                      <td key={c.key} className={`py-3 px-3 text-right font-bold ${c.color}`}>
                        {getVal(period.totals as unknown as Record<string, unknown>, c.key, c.isRate)}
                      </td>
                    ))}
                  </tr>

                  {/* Agent detail rows */}
                  {isOpen && period.agents.map(agent => (
                    <tr key={`${period.periodKey}-${agent.opener}`} className="hover:bg-slate-800/20 transition-colors">
                      <td className="py-2 px-4 sticky left-0 bg-slate-900/90 z-10 border-r border-slate-800">
                        <span className="pl-6 text-slate-300 font-medium">{agent.opener}</span>
                      </td>
                      {METRIC_COLS.map(c => (
                        <td key={c.key} className={`py-2 px-3 text-right ${c.color} opacity-80`}>
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
    </div>
  );
};

