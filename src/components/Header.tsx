'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Calendar, ChevronDown, FileSpreadsheet, FileText, LogOut, PhoneCall, Link2, Printer, RefreshCw, Target, Upload, User, Users, Wrench, X } from 'lucide-react';
import { DataSourceInfo, FilterState, OpenerStats, ViewerInfo } from '@/types/dashboard';
import { CSV_KINDS, CsvKind } from '@/lib/exportXlsx';

interface HeaderProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  openers: OpenerStats[];
  onRefresh: () => void;
  onOpenImportModal?: () => void;
  onExportXlsx?: () => void;
  onExportCsv?: (kind: CsvKind) => void;
  onOpenSheetTools?: () => void;
  onPrint?: () => void;
  onCopyLink?: () => void;
  onOpenTargets?: () => void;
  loading: boolean;
  lastUpdated: string;
  isMockData?: boolean;
  dataSourceInfo?: DataSourceInfo;
  viewer?: ViewerInfo;
  /** True when the last background refresh failed (numbers shown are the last good ones). */
  pollFailed?: boolean;
}

type Preset = FilterState['preset'];
interface PresetOption { label: string; value: Preset; getRange: () => { startDate: string; endDate: string }; }

function formatLocalDateYMD(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

const PRESETS: PresetOption[] = [
  // Uploads arrive the day after, so "today" is never loaded: this is the previous working day (Saturday and Sunday are off).
  { label: 'Yesterday', value: 'yesterday', getRange: () => { const d = new Date(); do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6); const date = formatLocalDateYMD(d); return { startDate: date, endDate: date }; } },
  { label: 'This week', value: 'this_week', getRange: () => { const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1)); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); return { startDate: formatLocalDateYMD(monday), endDate: formatLocalDateYMD(sunday) }; } },
  { label: 'This month', value: 'this_month', getRange: () => { const now = new Date(); return { startDate: formatLocalDateYMD(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: formatLocalDateYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }; } },
  { label: 'Last 30 days', value: 'last_30_days', getRange: () => { const end = new Date(); const start = new Date(end); start.setDate(end.getDate() - 29); return { startDate: formatLocalDateYMD(start), endDate: formatLocalDateYMD(end) }; } },
];

export const Header: React.FC<HeaderProps> = ({ filters, onFilterChange, openers, onRefresh, onOpenImportModal, onExportXlsx, onExportCsv, onOpenSheetTools, onPrint, onCopyLink, onOpenTargets, loading, lastUpdated, isMockData, dataSourceInfo, viewer, pollFailed }) => {
  const updatedAt = lastUpdated ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    // Full page load so every bit of signed-in state is dropped.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  };
  const sourceLabel = isMockData ? 'Demo data' : dataSourceInfo?.source === 'supabase' ? 'Cached data' : 'Live data';
  const clearFilters = () => onFilterChange({ selectedOpener: 'ALL', preset: 'this_week' });

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const runAction = (fn?: () => void) => () => { setMenuOpen(false); fn?.(); };
  const hasActions = Boolean(onCopyLink || onOpenTargets || onExportXlsx || onExportCsv || onOpenImportModal || onPrint || onOpenSheetTools);
  const itemClass = 'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left text-xs font-medium hover:bg-white/6 cursor-pointer';

  return (
    <header className="sm:sticky sm:top-0 z-30 border-b border-white/7 bg-base/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-gold-dim border border-gold-border"><PhoneCall className="w-4 h-4 text-gold" /></div>
            <div className="min-w-0">
              <h1 className="font-serif text-base sm:text-lg font-bold text-white leading-tight">BD Manager Dashboard</h1>
              <p className="flex items-center gap-2 text-xs text-text-dim mt-0.5">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${isMockData || pollFailed ? 'bg-warn' : 'bg-success'}`} aria-hidden="true" />
                {pollFailed ? <span className="text-[#fca5a5]">Live updates paused · </span> : null}
                {sourceLabel}{updatedAt ? ` · Data as of ${updatedAt}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasActions && (
              <div className="relative" ref={menuRef}>
                <button type="button" className="btn" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
                  Actions<ChevronDown className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                </button>
                {menuOpen && (
                  <div role="menu" className="absolute right-0 top-11 z-40 w-64 rounded-lg bg-elevated border border-white/12 shadow-2xl p-1.5">
                    {onExportXlsx && <button role="menuitem" onClick={runAction(onExportXlsx)} className={itemClass}><FileSpreadsheet className="w-4 h-4 text-success" />Export report (XLSX)</button>}
                    {onExportCsv && (
                      <>
                        <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-text-dim">Export CSV</p>
                        {CSV_KINDS.map(({ kind, label }) => (
                          <button key={kind} role="menuitem" onClick={runAction(() => onExportCsv(kind))} className={itemClass}><FileText className="w-4 h-4 text-success" />{label}</button>
                        ))}
                      </>
                    )}
                    {onCopyLink && <button role="menuitem" onClick={runAction(onCopyLink)} className={itemClass}><Link2 className="w-4 h-4 text-text-muted" />Copy link to this view</button>}
                    {onOpenTargets && <button role="menuitem" onClick={runAction(onOpenTargets)} className={itemClass}><Target className="w-4 h-4 text-gold-light" />Weekly targets</button>}
                    {onPrint && <button role="menuitem" onClick={runAction(onPrint)} className={itemClass}><Printer className="w-4 h-4 text-text-muted" />Print / Save PDF</button>}
                    {onOpenSheetTools && <button role="menuitem" onClick={runAction(onOpenSheetTools)} className={itemClass}><Wrench className="w-4 h-4 text-gold-light" />Call log maintenance</button>}
                    {onOpenImportModal && <button role="menuitem" onClick={runAction(onOpenImportModal)} className={itemClass}><Upload className="w-4 h-4 text-gold-light" />Import Excel</button>}
                  </div>
                )}
              </div>
            )}
            {viewer && (
              <details className="relative">
                <summary className="btn list-none cursor-pointer">
                  <User className="w-3.5 h-3.5" /><span className="hidden sm:inline max-w-32 truncate">{viewer.name}</span><span className="text-[10px] uppercase text-text-dim">{viewer.role}</span>
                </summary>
                <div className="absolute right-0 top-11 z-40 w-48 rounded-lg bg-elevated border border-white/12 shadow-2xl p-1.5">
                  <p className="px-2.5 py-1.5 text-[11px] text-text-dim truncate">{viewer.email}</p>
                  {viewer.role === 'admin' && <Link href="/admin/users" className={itemClass}><Users className="w-4 h-4 text-gold-light" />Manage users</Link>}
                  {viewer.id !== 'dev' && <Link href="/account" className={itemClass}>Change password</Link>}
                  {viewer.id !== 'dev' && <button onClick={signOut} className={itemClass}><LogOut className="w-4 h-4" />Sign out</button>}
                </div>
              </details>
            )}
            <button type="button" onClick={onRefresh} disabled={loading} aria-label="Refresh dashboard data" className="btn btn-primary">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div role="group" aria-label="Dashboard filters" className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Date range">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                aria-pressed={filters.preset === preset.value}
                className="seg-item"
                onClick={() => onFilterChange({ ...preset.getRange(), preset: preset.value })}
              >{preset.label}</button>
            ))}
          </div>

          <div className="field">
            <Calendar className="w-3.5 h-3.5 text-text-dim" aria-hidden="true" />
            <label className="sr-only" htmlFor="start-date">Start date</label>
            <input id="start-date" type="date" value={filters.startDate} max={filters.endDate || undefined} onChange={(e) => onFilterChange({ startDate: e.target.value, preset: 'custom' })} />
            <span className="text-text-dim">→</span>
            <label className="sr-only" htmlFor="end-date">End date</label>
            <input id="end-date" type="date" value={filters.endDate} min={filters.startDate || undefined} onChange={(e) => onFilterChange({ endDate: e.target.value, preset: 'custom' })} />
          </div>

          <label className="field">
            <User className="w-3.5 h-3.5 text-text-dim" aria-hidden="true" />
            <span className="sr-only">Filter by agent</span>
            <select value={filters.selectedOpener} onChange={(e) => onFilterChange({ selectedOpener: e.target.value })}>
              <option value="ALL">All agents</option>
              {openers.map((o) => <option key={o.opener} value={o.opener}>{o.opener}</option>)}
            </select>
          </label>

          {filters.selectedOpener !== 'ALL' && (
            <button type="button" onClick={clearFilters} className="btn btn-primary">
              {filters.selectedOpener}<X className="w-3.5 h-3.5" aria-label="Clear agent filter" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
