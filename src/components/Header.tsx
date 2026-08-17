'use client';

import React from 'react';
import { RefreshCw, PhoneCall, Calendar, User, Database, CheckCircle2 } from 'lucide-react';
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

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-bold">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">BD Call & Pipeline Dashboard</h1>
                {isMockData ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/40 text-amber-300 border border-amber-700/50">
                    <Database className="w-3 h-3 mr-1" /> Demo Data
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-700/50">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Live Sheets Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Connected to Ultatel Call Logs & BD Tracker Sheet
                {formattedTime && <span className="ml-2 font-mono text-slate-500">Updated: {formattedTime}</span>}
              </p>
            </div>
          </div>

          {/* Controls & Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Opener Filter */}
            <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-1.5 shadow-sm text-sm">
              <User className="w-4 h-4 text-slate-400 mr-2" />
              <select
                value={filters.selectedOpener}
                onChange={(e) => onFilterChange({ selectedOpener: e.target.value })}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer pr-2 text-sm"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">All Openers</option>
                {openers.map((o) => (
                  <option key={o.opener} value={o.opener} className="bg-slate-900 text-slate-200">
                    {o.opener}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Start */}
            <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-sm text-sm">
              <Calendar className="w-4 h-4 text-slate-400 mr-2" />
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => onFilterChange({ startDate: e.target.value })}
                className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
                title="Start Date"
              />
              <span className="text-slate-500 mx-1.5 text-xs">to</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => onFilterChange({ endDate: e.target.value })}
                className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
                title="End Date"
              />
            </div>

            {/* Quick Reset Filter */}
            {(filters.startDate || filters.endDate || filters.selectedOpener !== 'ALL') && (
              <button
                onClick={() => onFilterChange({ startDate: '', endDate: '', selectedOpener: 'ALL' })}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 transition-colors"
              >
                Reset Filters
              </button>
            )}

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-3.5 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
