'use client';

import React from 'react';
import { Calendar, ChevronDown, FileSpreadsheet, PhoneCall, RefreshCw, Upload, User, X } from 'lucide-react';
import { DataSourceInfo, FilterState, OpenerStats } from '@/types/dashboard';

interface HeaderProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  openers: OpenerStats[];
  onRefresh: () => void;
  onOpenImportModal?: () => void;
  onExportXlsx?: () => void;
  loading: boolean;
  lastUpdated: string;
  isMockData?: boolean;
  dataSourceInfo?: DataSourceInfo;
}

type Preset = FilterState['preset'];
interface PresetOption { label: string; value: Preset; getRange: () => { startDate: string; endDate: string }; }

function formatLocalDateYMD(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

const PRESETS: PresetOption[] = [
  { label: 'Today', value: 'today', getRange: () => { const date = formatLocalDateYMD(new Date()); return { startDate: date, endDate: date }; } },
  { label: 'This week', value: 'this_week', getRange: () => { const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1)); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); return { startDate: formatLocalDateYMD(monday), endDate: formatLocalDateYMD(sunday) }; } },
  { label: 'This month', value: 'this_month', getRange: () => { const now = new Date(); return { startDate: formatLocalDateYMD(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: formatLocalDateYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }; } },
  { label: 'Last 30 days', value: 'last_30_days', getRange: () => { const end = new Date(); const start = new Date(end); start.setDate(end.getDate() - 29); return { startDate: formatLocalDateYMD(start), endDate: formatLocalDateYMD(end) }; } },
];

export const Header: React.FC<HeaderProps> = ({ filters, onFilterChange, openers, onRefresh, onOpenImportModal, onExportXlsx, loading, lastUpdated, isMockData, dataSourceInfo }) => {
  const updatedAt = lastUpdated ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const sourceLabel = isMockData ? 'Demo data' : dataSourceInfo?.source === 'supabase' ? 'Cached data' : 'Live data';
  const clearFilters = () => onFilterChange({ selectedOpener: 'ALL', preset: 'this_week' });

  return (
    <header className="sticky top-0 z-30 border-b border-white/7 bg-base/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-gold-dim border border-gold-border"><PhoneCall className="w-4 h-4 text-gold" /></div>
            <div className="min-w-0">
              <h1 className="font-serif text-lg font-bold text-white truncate">BD Manager Dashboard</h1>
              <p className="label-caps mt-0.5">{sourceLabel}{updatedAt ? ` · Updated ${updatedAt}` : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(onExportXlsx || onOpenImportModal) && (
              <details className="relative">
                <summary className="list-none flex items-center gap-1.5 min-h-9 px-3 rounded-lg text-xs font-semibold cursor-pointer border border-white/10 text-text-primary"><ChevronDown className="w-3.5 h-3.5" />Actions</summary>
                <div className="absolute right-0 top-11 z-40 w-44 rounded-lg bg-card border border-white/10 shadow-xl p-1.5">
                  {onExportXlsx && <button onClick={onExportXlsx} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs hover:bg-white/5"><FileSpreadsheet className="w-3.5 h-3.5 text-success" />Export XLSX</button>}
                  {onOpenImportModal && <button onClick={onOpenImportModal} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs hover:bg-white/5"><Upload className="w-3.5 h-3.5 text-gold-light" />Import Excel</button>}
                </div>
              </details>
            )}
            <button onClick={onRefresh} disabled={loading} aria-label="Refresh dashboard data" className="min-h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-gold-dim border border-gold-border text-gold-light disabled:opacity-40">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>

        <div aria-label="Dashboard filters" className="flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 p-1 rounded-lg bg-white/4 border border-white/7 overflow-x-auto max-w-full">
            {PRESETS.map((preset) => <button key={preset.value} onClick={() => { const range = preset.getRange(); onFilterChange({ ...range, preset: preset.value }); }} className={`min-h-8 px-3 rounded-md text-xs font-semibold whitespace-nowrap ${filters.preset === preset.value ? 'bg-white text-black' : 'text-text-dim'}`}>{preset.label}</button>)}
          </div>
          <label className="flex items-center gap-2 min-h-9 px-2.5 rounded-lg text-xs bg-white/4 border border-white/7"><User className="w-3.5 h-3.5 text-text-dim" /><span className="sr-only">Filter by agent</span><select value={filters.selectedOpener} onChange={(event) => onFilterChange({ selectedOpener: event.target.value })} className="bg-transparent text-text-muted font-num focus:outline-none"><option value="ALL" className="bg-base">All agents</option>{openers.map((opener) => <option key={opener.opener} value={opener.opener} className="bg-base">{opener.opener}</option>)}</select></label>
          <div className="flex items-center gap-2 min-h-9 px-2.5 rounded-lg bg-white/4 border border-white/7"><Calendar className="w-3.5 h-3.5 text-text-dim" /><label className="sr-only" htmlFor="start-date">Start date</label><input id="start-date" type="date" value={filters.startDate} onChange={(event) => onFilterChange({ startDate: event.target.value, preset: 'custom' })} className="bg-transparent text-text-muted text-xs font-num focus:outline-none" /><span className="text-text-faint text-xs">to</span><label className="sr-only" htmlFor="end-date">End date</label><input id="end-date" type="date" value={filters.endDate} onChange={(event) => onFilterChange({ endDate: event.target.value, preset: 'custom' })} className="bg-transparent text-text-muted text-xs font-num focus:outline-none" /></div>
          {filters.selectedOpener !== 'ALL' && <button onClick={clearFilters} className="min-h-9 px-2 text-xs text-text-dim hover:text-text-primary flex items-center gap-1"><X className="w-3.5 h-3.5" />Clear agent</button>}
        </div>
      </div>
    </header>
  );
};
