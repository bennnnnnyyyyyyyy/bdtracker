'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/Header';
import { KpiGrid } from '@/components/KpiGrid';
import { OpenerTable } from '@/components/OpenerTable';
import { CallLogsView } from '@/components/CallLogsView';
import { AgentDashboardView } from '@/components/AgentDashboardView';
import { FilterState, DashboardResponse } from '@/types/dashboard';
import { AlertCircle, RefreshCw, LayoutGrid, Table as TableIcon, PhoneCall } from 'lucide-react';

type ActiveTab = 'agents' | 'table' | 'calls';

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
  { id: 'agents', label: 'Agents', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'table', label: 'Full Table', icon: <TableIcon className="w-4 h-4" /> },
  { id: 'calls', label: 'Call Logs', icon: <PhoneCall className="w-4 h-4" /> },
];

const DEFAULT_FILTERS: FilterState = {
  startDate: '',
  endDate: '',
  selectedOpener: 'ALL',
  searchQuery: '',
  preset: 'all_time'
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
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden px-6 py-12"
      style={{
        background:
          'radial-gradient(circle at 50% 30%, rgba(201,168,76,0.14), transparent 45%), linear-gradient(180deg, #121215 0%, #09090b 100%)'
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full blur-[100px] animate-pulse"
          style={{ background: 'rgba(201,168,76,0.12)' }}
        />
        <div
          className="absolute bottom-10 right-1/4 h-80 w-80 rounded-full blur-[120px] animate-pulse"
          style={{ background: 'rgba(255,255,255,0.03)', animationDelay: '500ms' }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center text-center max-w-2xl w-full">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl border shadow-[0_0_60px_rgba(201,168,76,0.18)] mb-6"
          style={{ borderColor: 'rgba(201,168,76,0.28)', background: 'rgba(17,17,19,0.92)' }}
        >
          <RefreshCw className="w-8 h-8 animate-spin" style={{ color: '#e8c56a' }} />
        </div>

        <div>
          <p className="label-caps tracking-widest text-xs font-semibold uppercase" style={{ color: '#c9a84c' }}>
            Caching in browser storage
          </p>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white font-serif">
            Warming the dashboard before you touch it
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm sm:text-base leading-relaxed text-[#a1a1aa]">
            Pulling the latest sheets payload, saving it locally, and preparing the tab views so repeat visits stay fast.
          </p>
        </div>

        <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { title: 'Fetching live data', desc: 'This happens automatically on first load.' },
            { title: 'Writing browser cache', desc: 'This happens automatically on first load.' },
            { title: 'Preparing tab panels', desc: 'This happens automatically on first load.' }
          ].map((step, index) => (
            <div
              key={step.title}
              className="rounded-2xl border px-4 py-4 text-left backdrop-blur-md"
              style={{
                borderColor: 'rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                animationDelay: `${index * 120}ms`
              }}
            >
              <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#e8c56a' }} />
              <p className="mt-3 text-sm font-medium text-white">{step.title}</p>
              <p className="mt-1 text-xs text-[#71717a]">{step.desc}</p>
            </div>
          ))}
        </div>
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
        loading={loading}
        lastUpdated={data?.lastUpdated || ''}
        isMockData={data?.isMockData}
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
              className="flex gap-0 text-sm font-medium overflow-x-auto"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              {TABS.map(tab => (
                <button
                  key={tab.id}
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
                totals={data.totals}
                filters={filters}
              />
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
