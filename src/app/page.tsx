'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { KpiGrid } from '@/components/KpiGrid';
import { OpenerTable } from '@/components/OpenerTable';
import { CallLogsView } from '@/components/CallLogsView';
import { PeriodicBreakdownTable } from '@/components/PeriodicBreakdownTable';
import { DashboardCharts } from '@/components/DashboardCharts';
import { AgentDashboardView } from '@/components/AgentDashboardView';
import { FileImportModal } from '@/components/FileImportModal';
import { exportDashboardAnalyticsXlsx } from '@/lib/exportXlsx';
import { FilterState, DashboardResponse, OrgTotals } from '@/types/dashboard';
import { AlertCircle, RefreshCw, LayoutGrid, Table as TableIcon, PhoneCall, BarChart3, PieChart } from 'lucide-react';

type ActiveTab = 'overview' | 'agents' | 'periods' | 'table' | 'calls';

const DASHBOARD_UI_CACHE_KEY = 'bd-tracker-dashboard-ui-cache-v1';
const DASHBOARD_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type DashboardUiCache = {
  filters: FilterState;
  activeTab: ActiveTab;
  savedAt: number;
};

type PeriodView = 'daily' | 'weekly' | 'monthly';
const PERIOD_VIEWS: { id: PeriodView; label: string; title: string }[] = [
  { id: 'daily', label: 'Daily', title: 'Daily performance' },
  { id: 'weekly', label: 'Weekly', title: 'Weekly performance' },
  { id: 'monthly', label: 'Monthly', title: 'Monthly performance' },
];

const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <PieChart className="w-4 h-4" /> },
  { id: 'agents', label: 'Team', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'periods', label: 'Trends', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'table', label: 'Details', icon: <TableIcon className="w-4 h-4" /> },
  { id: 'calls', label: 'Call Logs', icon: <PhoneCall className="w-4 h-4" /> },
];

function getThisWeekRange(): Pick<FilterState, 'startDate' | 'endDate'> {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const format = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
  return { startDate: format(monday), endDate: format(sunday) };
}

const DEFAULT_FILTERS: FilterState = {
  ...getThisWeekRange(),
  selectedOpener: 'ALL',
  searchQuery: '',
  preset: 'this_week'
};

function shiftToPreviousRange(startDate: string, endDate: string): { startDate: string; endDate: string } | null {
  if (!startDate || !endDate) return null;
  const parse = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmt = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const start = parse(startDate);
  const end = parse(endDate);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (!Number.isFinite(days) || days < 1) return null;
  const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (days - 1));
  return { startDate: fmt(prevStart), endDate: fmt(prevEnd) };
}

function readJsonStorage<T>(storageKey: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJsonStorage(storageKey: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Ignore quota or privacy-mode failures and keep the dashboard usable.
  }
}

function readUiCache(): DashboardUiCache | null {
  const cached = readJsonStorage<DashboardUiCache>(DASHBOARD_UI_CACHE_KEY);
  if (!cached) return null;
  if (Date.now() - cached.savedAt > DASHBOARD_CACHE_TTL_MS * 4) return null;
  return cached;
}

function writeUiCache(filters: FilterState, activeTab: ActiveTab): void {
  writeJsonStorage(DASHBOARD_UI_CACHE_KEY, {
    filters,
    activeTab,
    savedAt: Date.now()
  } satisfies DashboardUiCache);
}

function DashboardLoadingScreen() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: '#09090b' }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-3 text-sm text-[#a1a1aa]">
        <RefreshCw className="h-4 w-4 animate-spin" style={{ color: '#e8c56a' }} />
        <span>Loading dashboard…</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [prevTotals, setPrevTotals] = useState<OrgTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [periodView, setPeriodView] = useState<PeriodView>('daily');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const cachedUi = readUiCache();
      if (cachedUi?.filters) {
        setFilters(cachedUi.filters);
      }
      if (cachedUi?.activeTab) {
        setActiveTab(cachedUi.activeTab);
      }
      setHasHydrated(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    writeUiCache(filters, activeTab);
  }, [filters, activeTab, hasHydrated]);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.selectedOpener && filters.selectedOpener !== 'ALL') {
        params.set('opener', filters.selectedOpener);
      }
      if (forceRefresh) params.set('refresh', 'true');

      const res = await fetch('/api/dashboard?' + params.toString(), { cache: 'no-store' });
      if (!res.ok) {
        let errDetail = res.statusText;
        try {
          const errBody = await res.json();
          if (errBody?.error) errDetail = errBody.error;
        } catch {
          // ignore json parse error
        }
        throw new Error(errDetail || 'Failed to load dashboard data');
      }

      const json: DashboardResponse = await res.json();
      setData(json);
      setError(null);

      // Previous period of the same length, used for KPI comparison. Best effort only.
      const prev = shiftToPreviousRange(filters.startDate, filters.endDate);
      if (prev) {
        const prevParams = new URLSearchParams(params);
        prevParams.set('startDate', prev.startDate);
        prevParams.set('endDate', prev.endDate);
        prevParams.delete('refresh');
        fetch('/api/dashboard?' + prevParams.toString(), { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null))
          .then((prevJson: DashboardResponse | null) => setPrevTotals(prevJson?.totals ?? null))
          .catch(() => setPrevTotals(null));
      } else {
        setPrevTotals(null);
      }
    } catch (err: unknown) {
      console.error('Error fetching dashboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, [filters.startDate, filters.endDate, filters.selectedOpener]);

  useEffect(() => {
    if (!hasHydrated) return;
    const frame = window.requestAnimationFrame(() => {
      fetchData();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [fetchData, hasHydrated]);

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
  };

  if (!hasHydrated || (loading && !data)) {
    return <DashboardLoadingScreen />;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#09090b', color: '#f4f4f5' }}>
      <Header
        filters={filters}
        onFilterChange={handleFilterChange}
        openers={data?.openers || []}
        onRefresh={() => fetchData(true)}
        onOpenImportModal={() => setImportModalOpen(true)}
        onPrint={() => window.print()}
        onExportXlsx={data ? () => exportDashboardAnalyticsXlsx(data, filters) : undefined}
        loading={loading}
        lastUpdated={data?.lastUpdated || ''}
        isMockData={data?.isMockData}
        dataSourceInfo={data?.dataSourceInfo}
      />

      <FileImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => fetchData(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {error && (
          <div
            className="rounded-xl p-4 flex items-center justify-between text-sm"
            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#fca5a5' }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" style={{ color: '#f87171' }} />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchData(true)}
              className="btn btn-danger"
            >
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            <KpiGrid totals={data.totals} previous={prevTotals} />

            <div
              role="tablist"
              aria-label="Dashboard views"
              className="flex gap-0 text-sm font-medium overflow-x-auto"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className="pb-3 pt-1 px-5 flex items-center gap-2 cursor-pointer transition-colors border-b-2 whitespace-nowrap hover:text-text-primary"
                  style={
                    activeTab === tab.id
                      ? { borderColor: '#c9a84c', color: '#e8c56a', fontWeight: 600 }
                      : { borderColor: 'transparent', color: '#71717a' }
                  }
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'overview' && <DashboardCharts openers={data.openers} daily={data.dailyBreakdown} />}
            {activeTab === 'agents' && (
              <AgentDashboardView
                openers={data.openers}
                filters={filters}
              />
            )}
            {activeTab === 'periods' && (
              <section className="space-y-4" aria-labelledby="trends-heading">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="sec-tag mb-1">Trends</p>
                    <h2 id="trends-heading" className="font-serif text-xl font-bold text-white">{PERIOD_VIEWS.find(v => v.id === periodView)?.title}</h2>
                    <p className="text-xs text-text-dim mt-1">Click a row to expand the per-agent breakdown</p>
                  </div>
                  <div className="seg" role="group" aria-label="Period granularity">
                    {PERIOD_VIEWS.map(v => (
                      <button key={v.id} type="button" className="seg-item" aria-pressed={periodView === v.id} onClick={() => setPeriodView(v.id)}>{v.label}</button>
                    ))}
                  </div>
                </div>
                <PeriodicBreakdownTable
                  key={periodView}
                  data={periodView === 'daily' ? data.dailyBreakdown : periodView === 'weekly' ? data.weeklyBreakdown : data.monthlyBreakdown}
                  emptyLabel={`No ${periodView} activity in this period`}
                />
              </section>
            )}
            {activeTab === 'table' && (
              <OpenerTable openers={data.openers} totals={data.totals} />
            )}
            {activeTab === 'calls' && (
              <CallLogsView calls={data.calls} />
            )}
          </>
        )}
      </main>

      <footer
        className="py-4 text-center label-caps"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        BD Call &amp; Pipeline Dashboard
      </footer>
    </div>
  );
}
