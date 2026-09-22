'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/Header';
import { KpiGrid } from '@/components/KpiGrid';
import { OpenerTable } from '@/components/OpenerTable';
import { CallLogsView } from '@/components/CallLogsView';
import { PeriodicBreakdownTable } from '@/components/PeriodicBreakdownTable';
import { AgentDashboardView } from '@/components/AgentDashboardView';
import { FileImportModal } from '@/components/FileImportModal';
import { exportDashboardAnalyticsXlsx } from '@/lib/exportXlsx';
import { FilterState, DashboardResponse } from '@/types/dashboard';
import { AlertCircle, RefreshCw, LayoutGrid, Table as TableIcon, PhoneCall, BarChart3 } from 'lucide-react';

type ActiveTab = 'agents' | 'periods' | 'table' | 'calls';

const DASHBOARD_DATA_CACHE_KEY = 'bd-tracker-dashboard-data-cache-v2';
const DASHBOARD_UI_CACHE_KEY = 'bd-tracker-dashboard-ui-cache-v1';
const DASHBOARD_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DASHBOARD_CACHE_LIMIT = 8;

type DashboardCacheStore = Record<string, { savedAt: number; data: DashboardResponse }>;
type DashboardUiCache = {
  filters: FilterState;
  activeTab: ActiveTab;
  savedAt: number;
};

const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
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

function buildDataCacheKey(filters: FilterState): string {
  return JSON.stringify({
    startDate: filters.startDate || '',
    endDate: filters.endDate || '',
    selectedOpener: filters.selectedOpener || 'ALL'
  });
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

function readCachedDashboard(cacheKey: string): DashboardResponse | null {
  const store = readJsonStorage<DashboardCacheStore>(DASHBOARD_DATA_CACHE_KEY);
  const entry = store?.[cacheKey];
  if (!entry) return null;
  if (Date.now() - entry.savedAt > DASHBOARD_CACHE_TTL_MS) return null;
  return entry.data;
}

function writeCachedDashboard(cacheKey: string, data: DashboardResponse): void {
  const store = readJsonStorage<DashboardCacheStore>(DASHBOARD_DATA_CACHE_KEY) ?? {};
  store[cacheKey] = { savedAt: Date.now(), data };

  const prunedEntries = Object.entries(store)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, DASHBOARD_CACHE_LIMIT);

  writeJsonStorage(DASHBOARD_DATA_CACHE_KEY, Object.fromEntries(prunedEntries));
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('agents');
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

  const cacheKey = useMemo(() => buildDataCacheKey(filters), [
    filters
  ]);

  const fetchData = useCallback(async (forceRefresh = false) => {
    const cached = !forceRefresh ? readCachedDashboard(cacheKey) : null;
    if (cached) {
      setData(cached);
    }
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.selectedOpener && filters.selectedOpener !== 'ALL') {
        params.set('opener', filters.selectedOpener);
      }
      if (forceRefresh) params.set('refresh', 'true');

      const res = await fetch('/api/dashboard?' + params.toString());
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
      writeCachedDashboard(cacheKey, json);
      setError(null);
    } catch (err: unknown) {
      console.error('Error fetching dashboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, [cacheKey, filters.startDate, filters.endDate, filters.selectedOpener]);

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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
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
              className="font-num text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              style={{ background: 'rgba(248,113,113,0.12)', color: '#fca5a5' }}
            >
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            <KpiGrid totals={data.totals} />

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
                  className="pb-3 pt-1 px-4 flex items-center gap-2 cursor-pointer transition-all border-b-2 whitespace-nowrap"
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

            {activeTab === 'agents' && (
              <AgentDashboardView
                openers={data.openers}
                filters={filters}
              />
            )}
            {activeTab === 'periods' && (
              <div className="space-y-6">
                <section>
                  <div className="sec-tag mb-2">Daily performance</div>
                  <PeriodicBreakdownTable data={data.dailyBreakdown} emptyLabel="No daily activity in this period" />
                </section>
                <section>
                  <div className="sec-tag mb-2">Weekly performance</div>
                  <PeriodicBreakdownTable data={data.weeklyBreakdown} emptyLabel="No weekly activity in this period" />
                </section>
                <section>
                  <div className="sec-tag mb-2">Monthly performance</div>
                  <PeriodicBreakdownTable data={data.monthlyBreakdown} emptyLabel="No monthly activity in this period" />
                </section>
              </div>
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
        BD Call &amp; Pipeline Dashboard · Google Sheets API v4
      </footer>
    </div>
  );
}
