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
  return d.toISOString().split('T')[0];
}

const PRESETS: PresetOption[] = [
  {
    label: 'Today',
    value: 'today',
    getRange: () => {
      const today = toYMD(new Date());
      return { startDate: today, endDate: today };
    }
  },
  {
    label: 'This Week',
    value: 'this_week',
    getRange: () => {
      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      return { startDate: toYMD(monday), endDate: toYMD(now) };
    }
  },
  {
    label: 'This Month',
    value: 'this_month',
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: toYMD(start), endDate: toYMD(now) };
    }
  },
  {
    label: 'Last 30 Days',
    value: 'last_30_days',
    getRange: () => {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      return { startDate: toYMD(start), endDate: toYMD(now) };
    }
  },
  {
    label: 'All Time',
    value: 'all_time',
    getRange: () => ({ startDate: '', endDate: '' })
  }
];

export const Header: React.FC<HeaderProps> = ({
  filters,
  onFilterChange,
  openers,
  onRefresh,
  loading,
  lastUpdated,
  isMockData
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
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {/* Top Row: Logo + Title + Refresh */}
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-bold shrink-0">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">BD Call & Pipeline Dashboard</h1>
                {isMockData ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/40 text-amber-300 border border-amber-700/50">
                    <Database className="w-3 h-3 mr-1" /> Demo Data
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-700/50">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Live Sheets
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Ultatel Call Logs · BD Tracker
                {formattedTime && <span className="ml-2 font-mono">Updated {formattedTime}</span>}
              </p>
            </div>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-3.5 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Bottom Row: Presets + Agent Filter + Custom Dates */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1">
            {PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => handlePreset(p)}
                className={`text-xs font-medium px-3 py-1 rounded-md transition-all cursor-pointer ${
                  filters.preset === p.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Opener Filter */}
          <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-sm gap-2">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={filters.selectedOpener}
              onChange={(e) => onFilterChange({ selectedOpener: e.target.value })}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs"
            >
              <option value="ALL" className="bg-slate-900">All Agents</option>
              {openers.map((o) => (
                <option key={o.opener} value={o.opener} className="bg-slate-900">{o.opener}</option>
              ))}
            </select>
          </div>

          {/* Custom Date Range */}
          <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 gap-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => onFilterChange({ startDate: e.target.value, preset: 'custom' })}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
              title="Start Date"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => onFilterChange({ endDate: e.target.value, preset: 'custom' })}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
              title="End Date"
            />
          </div>

          {/* Reset Button */}
          {hasActiveFilter && (
            <button
              onClick={() => onFilterChange({ startDate: '', endDate: '', selectedOpener: 'ALL', preset: 'all_time' })}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white font-medium px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-800"
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
