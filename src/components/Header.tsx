'use client';

import React from 'react';
import { RefreshCw, PhoneCall, Calendar, User, Database, CheckCircle2, X } from 'lucide-react';
import { FilterState, OpenerStats } from '@/types/dashboard';

interface HeaderProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  openers: OpenerStats[];
  onRefresh: () => void;
  loading: boolean;
  lastUpdated: string;
  isMockData?: boolean;
}

type Preset = FilterState['preset'];

interface PresetOption {
  label: string;
  value: Preset;
  getRange: () => { startDate: string; endDate: string };
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const PRESETS: PresetOption[] = [
  {
    label: 'Today',
    value: 'today',
    getRange: () => { const t = toYMD(new Date()); return { startDate: t, endDate: t }; }
  },
  {
    label: 'This Week',
    value: 'this_week',
    getRange: () => {
      const now = new Date();
      const day = now.getDay();
      const mon = new Date(now);
      mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { startDate: toYMD(mon), endDate: toYMD(sun) };
    }
  },
  {
    label: 'This Month',
    value: 'this_month',
    getRange: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: toYMD(first), endDate: toYMD(last) };
    }
  },
  {
    label: 'Last 30 Days',
    value: 'last_30_days',
    getRange: () => {
      const now = new Date();
      const s = new Date(now); s.setDate(now.getDate() - 29);
      return { startDate: toYMD(s), endDate: toYMD(now) };
    }
  },
  { label: 'All Time', value: 'all_time', getRange: () => ({ startDate: '', endDate: '' }) },
];

export const Header: React.FC<HeaderProps> = ({
  filters, onFilterChange, openers, onRefresh, loading, lastUpdated, isMockData
}) => {
  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  const handlePreset = (preset: PresetOption) => {
    const { startDate, endDate } = preset.getRange();
    onFilterChange({ startDate, endDate, preset: preset.value });
  };

  const hasActiveFilter = filters.startDate || filters.endDate || filters.selectedOpener !== 'ALL';

  return (
    <header
      className="sticky top-0 z-30"
      style={{ background: 'rgba(9,9,11,0.9)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-3">

        {/* Top row: brand + refresh */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: '#1a1608', border: '1px solid rgba(201,168,76,0.35)' }}
            >
              <PhoneCall className="w-4 h-4" style={{ color: '#c9a84c' }} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-lg font-bold text-white">BD Call &amp; Pipeline</h1>
                {isMockData ? (
                  <span className="pill pill-warn">
                    <Database className="w-2.5 h-2.5 mr-1" />Demo
                  </span>
                ) : (
                  <span className="pill pill-success">
                    <CheckCircle2 className="w-2.5 h-2.5 mr-1" />Live
                  </span>
                )}
              </div>
              <p className="label-caps mt-0.5">
                Ultatel · BD Tracker
                {formattedTime && <span className="ml-2 font-num normal-case" style={{ fontSize: 9, color: '#52525b' }}>· {formattedTime}</span>}
              </p>
            </div>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-40"
            style={{ background: '#1a1608', border: '1px solid rgba(201,168,76,0.3)', color: '#e8c56a' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Bottom row: presets + filters */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Preset pills */}
          <div className="flex items-center gap-0.5 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => handlePreset(p)}
                className="text-xs font-semibold px-3 py-1 rounded-md transition-all cursor-pointer"
                style={
                  filters.preset === p.value
                    ? { background: '#ffffff', color: '#000000' }
                    : { color: '#71717a' }
                }
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Agent select */}
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <User className="w-3.5 h-3.5 text-[#52525b] shrink-0" />
            <select
              aria-label="Filter by agent"
              value={filters.selectedOpener}
              onChange={e => onFilterChange({ selectedOpener: e.target.value })}
              className="bg-transparent text-text-muted focus:outline-none cursor-pointer font-num"
              style={{ fontSize: 11 }}
            >
              <option value="ALL" className="bg-base">All Agents</option>
              {openers.map(o => (
                <option key={o.opener} value={o.opener} className="bg-base">{o.opener}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <Calendar className="w-3.5 h-3.5 text-[#52525b] shrink-0" />
            <input
              type="date"
              aria-label="Start date"
              value={filters.startDate}
              onChange={e => onFilterChange({ startDate: e.target.value, preset: 'custom' })}
              className="bg-transparent text-text-muted focus:outline-none cursor-pointer font-num"
              style={{ fontSize: 11 }}
            />
            <span className="text-text-faint font-num" style={{ fontSize: 11 }}>to</span>
            <input
              type="date"
              aria-label="End date"
              value={filters.endDate}
              onChange={e => onFilterChange({ endDate: e.target.value, preset: 'custom' })}
              className="bg-transparent text-text-muted focus:outline-none cursor-pointer font-num"
              style={{ fontSize: 11 }}
            />
          </div>

          {/* Clear */}
          {hasActiveFilter && (
            <button
              onClick={() => onFilterChange({ startDate: '', endDate: '', selectedOpener: 'ALL', preset: 'all_time' })}
              className="flex items-center gap-1 text-[#52525b] hover:text-text-muted text-xs font-medium px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

      </div>
    </header>
  );
};
