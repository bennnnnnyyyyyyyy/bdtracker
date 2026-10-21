'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from '@/components/Header';
import { KpiGrid } from '@/components/KpiGrid';
import { OpenerTable } from '@/components/OpenerTable';
import { TodayView } from '@/components/TodayView';
import { TrendsView } from '@/components/TrendsView';
import { DashboardCharts } from '@/components/DashboardCharts';
import { AgentDashboardView } from '@/components/AgentDashboardView';
import { FileImportModal } from '@/components/FileImportModal';
import { AgentsModal } from '@/components/AgentsModal';
import { SheetToolsModal } from '@/components/SheetToolsModal';
import { ConfirmationsView } from '@/components/ConfirmationsView';
import { FunnelChart } from '@/components/FunnelChart';
import { AttentionPanel } from '@/components/AttentionPanel';
import { TargetsModal } from '@/components/TargetsModal';
import { PrintReport } from '@/components/PrintReport';
import { needsAttention } from '@/lib/insights';
import { Targets, loadTargets, saveTargets, periodDays, scaledTarget, activeAgents, monthlyTargetForPeriod } from '@/lib/targets';
import { exportDashboardAnalyticsXlsx, exportDashboardCsv } from '@/lib/exportXlsx';
import { FilterState, DashboardResponse, OrgTotals } from '@/types/dashboard';
import { AlertCircle, RefreshCw, LayoutGrid, Table as TableIcon, BarChart3, CalendarCheck, CheckCircle2, PieChart, Clock } from 'lucide-react';

const canUpload = (role?: string) => role === 'admin' || role === 'manager' || role === 'uploader';

type ActiveTab = 'today' | 'overview' | 'agents' | 'periods' | 'table' | 'confirm';

// Live updates: the open dashboard re-reads the server every 30 s (the server caches sheet reads for ~30 s).
const LIVE_POLL_MS = 30_000;

const DASHBOARD_UI_CACHE_KEY = 'bd-tracker-dashboard-ui-cache-v1';
const DASHBOARD_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type DashboardUiCache = {
  filters: FilterState;
  activeTab: ActiveTab;
  savedAt: number;
};

type PeriodView = 'daily' | 'weekly' | 'monthly';

const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  { id: 'today', label: 'Today', icon: <CalendarCheck className="w-4 h-4" /> },
  { id: 'overview', label: 'Overview', icon: <PieChart className="w-4 h-4" /> },
  { id: 'agents', label: 'Team', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'periods', label: 'Trends', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'table', label: 'Details', icon: <TableIcon className="w-4 h-4" /> },
  { id: 'confirm', label: 'Confirm shows', icon: <CheckCircle2 className="w-4 h-4" /> },
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

const VALID_TABS: ActiveTab[] = ['today', 'overview', 'agents', 'periods', 'table', 'confirm'];
const VALID_PRESETS = ['yesterday', 'this_week', 'this_month', 'last_30_days', 'custom'] as const;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const STALE_AFTER_MS = 30 * 60 * 1000;

/** Filters and tab from a shared link, e.g. ?start=2026-10-12&end=2026-10-18&agent=Fabrice&tab=agents */
function readUrlState(): { filters: Partial<FilterState>; tab?: ActiveTab } | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const start = q.get('start');
  const end = q.get('end');
  const agent = q.get('agent');
  const tab = q.get('tab') as ActiveTab | null;
  const preset = q.get('preset') as FilterState['preset'] | null;
  const filters: Partial<FilterState> = {};
  if (start && end && YMD.test(start) && YMD.test(end)) {
    filters.startDate = start;
    filters.endDate = end;
    filters.preset = preset && (VALID_PRESETS as readonly string[]).includes(preset) ? preset : 'custom';
  }
  if (agent) filters.selectedOpener = agent;
  const validTab = tab && VALID_TABS.includes(tab) ? tab : undefined;
  return Object.keys(filters).length || validTab ? { filters, tab: validTab } : null;
}

function buildShareQuery(filters: FilterState, tab: ActiveTab): string {
  const q = new URLSearchParams();
  if (filters.startDate) q.set('start', filters.startDate);
  if (filters.endDate) q.set('end', filters.endDate);
  if (filters.preset) q.set('preset', filters.preset);
  if (filters.selectedOpener && filters.selectedOpener !== 'ALL') q.set('agent', filters.selectedOpener);
  q.set('tab', tab);
  return q.toString();
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
  const [sheetToolsOpen, setSheetToolsOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const cachedUi = readUiCache();
      if (cachedUi?.filters) {
        setFilters(cachedUi.filters);
      }
      if (cachedUi?.activeTab && VALID_TABS.includes(cachedUi.activeTab)) {
        setActiveTab(cachedUi.activeTab);
      }
      // A shared link wins over whatever this browser last had open.
      const fromUrl = readUrlState();
      if (fromUrl) {
        if (Object.keys(fromUrl.filters).length) setFilters(prev => ({ ...(cachedUi?.filters ?? prev), ...fromUrl.filters }));
        if (fromUrl.tab) setActiveTab(fromUrl.tab);
      }
      setTargets(loadTargets());
      setHasHydrated(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    writeUiCache(filters, activeTab);
    // Keep the address bar in sync so the page URL is always a shareable link to this exact view.
    try {
      window.history.replaceState(null, '', `${window.location.pathname}?${buildShareQuery(filters, activeTab)}`);
    } catch {
      // History can be unavailable in sandboxed frames; sharing then falls back to the plain URL.
    }
  }, [filters, activeTab, hasHydrated]);

  // Re-evaluate "how old is the data" once a minute without refetching.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?${buildShareQuery(filters, activeTab)}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast('Link copied to clipboard');
    } catch {
      setToast('Could not copy automatically — copy the address bar instead');
    }
  }, [filters, activeTab]);

  const handleSaveTargets = useCallback((t: Targets | null) => {
    setTargets(t);
    saveTargets(t);
  }, []);

  const fetchData = useCallback(async (forceRefresh = false, silent = false) => {
    // Silent (background) refreshes keep the current screen; only manual loads show the spinner.
    if (!silent) setLoading(true);

    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.selectedOpener && filters.selectedOpener !== 'ALL') {
        params.set('opener', filters.selectedOpener);
      }
      if (forceRefresh) params.set('refresh', 'true');

      const res = await fetch('/api/dashboard?' + params.toString(), { cache: 'no-store' });
      if (res.status === 401) {
        // Session expired: full reload to the sign-in page.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login';
        return;
      }
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
      setPollFailed(false);

      // Previous period of the same length, used for KPI comparison. Best effort only.
      const prev = shiftToPreviousRange(filters.startDate, filters.endDate);
      if (prev) {
        const prevParams = new URLSearchParams(params);
        prevParams.set('startDate', prev.startDate);
        prevParams.set('endDate', prev.endDate);
        prevParams.delete('refresh');
        prevParams.set('lite', 'true');
        fetch('/api/dashboard?' + prevParams.toString(), { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null))
          .then((prevJson: DashboardResponse | null) => setPrevTotals(prevJson?.totals ?? null))
          .catch(() => setPrevTotals(null));
      } else {
        setPrevTotals(null);
      }
    } catch (err: unknown) {
      console.error('Error fetching dashboard:', err);
      if (silent) {
        setPollFailed(true); // keep showing the last good numbers
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters.startDate, filters.endDate, filters.selectedOpener]);

  // Background polling while the tab is visible, plus an immediate refresh when it becomes visible again.
  const fetchRef = useRef(fetchData);
  useEffect(() => {
    fetchRef.current = fetchData;
  }, [fetchData]);
  useEffect(() => {
    if (!hasHydrated) return;
    const tick = () => {
      if (document.visibilityState === 'visible') fetchRef.current(false, true);
    };
    const timer = window.setInterval(tick, LIVE_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [hasHydrated]);

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

  const agentsInView = data ? activeAgents(data.openers) : [];
  const days = periodDays(filters.startDate, filters.endDate);
  const agentGoals = targets
    ? { calls: scaledTarget(targets.calls, days, 1), meetings: scaledTarget(targets.meetings, days, 1), onboarded: scaledTarget(targets.onboarded, days, 1) }
    : null;
  const teamGoals = targets
    ? { calls: scaledTarget(targets.calls, days, agentsInView.length), meetings: scaledTarget(targets.meetings, days, agentsInView.length), onboarded: scaledTarget(targets.onboarded, days, agentsInView.length) }
    : null;
  const attention = data ? needsAttention(agentsInView, { targets, startDate: filters.startDate, endDate: filters.endDate }) : [];
  const dataAsOfMs = data ? Date.parse(data.dataAsOf || data.lastUpdated || '') : NaN;
  const staleMinutes = Number.isFinite(dataAsOfMs) && now - dataAsOfMs > STALE_AFTER_MS ? Math.round((now - dataAsOfMs) / 60000) : null;

  if (!hasHydrated || (loading && !data)) {
    return <DashboardLoadingScreen />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-base text-text-primary print:bg-white print:text-black">
      <div className="contents print:hidden">
      <Header
        filters={filters}
        onFilterChange={handleFilterChange}
        openers={data?.openers || []}
        onRefresh={() => fetchData(true)}
        onOpenImportModal={!data?.viewer || canUpload(data.viewer.role) ? () => setImportModalOpen(true) : undefined}
        onOpenSheetTools={data?.viewer && (data.viewer.role === 'admin' || data.viewer.role === 'manager') ? () => setSheetToolsOpen(true) : undefined}
        onOpenAgents={data?.viewer && (data.viewer.role === 'admin' || data.viewer.role === 'manager') ? () => setAgentsOpen(true) : undefined}
        onPrint={() => window.print()}
        onCopyLink={handleCopyLink}
        onOpenTargets={() => setTargetsOpen(true)}
        onExportXlsx={data ? () => exportDashboardAnalyticsXlsx(data, filters) : undefined}
        onExportCsv={data ? (kind) => exportDashboardCsv(data, filters, kind) : undefined}
        loading={loading}
        lastUpdated={data?.dataAsOf || data?.lastUpdated || ''}
        viewer={data?.viewer}
        pollFailed={pollFailed}
        isMockData={data?.isMockData}
        dataSourceInfo={data?.dataSourceInfo}
      />

      <AgentsModal isOpen={agentsOpen} onClose={() => setAgentsOpen(false)} onChanged={() => fetchData(true, true)} />

      <SheetToolsModal
        isOpen={sheetToolsOpen}
        onClose={() => setSheetToolsOpen(false)}
        isAdmin={data?.viewer?.role === 'admin'}
        onChanged={() => fetchData(true, true)}
      />

      <TargetsModal isOpen={targetsOpen} current={targets} onClose={() => setTargetsOpen(false)} onSave={handleSaveTargets} />

      <FileImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => fetchData(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {staleMinutes !== null && (
          <div role="status" className="rounded-xl p-3 flex flex-wrap items-center gap-2 text-xs bg-warn-dim border border-warn-border text-warn">
            <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              Data last synced {staleMinutes >= 120 ? `${Math.round(staleMinutes / 60)} hours` : `${staleMinutes} minutes`} ago{pollFailed ? ' and live updates are paused' : ''}. Numbers may be out of date.
            </span>
            <button onClick={() => fetchData(true)} className="btn btn-primary !min-h-7 !px-3">Refresh now</button>
          </div>
        )}

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

        {data?.missingUploadDay && canUpload(data.viewer?.role) && (
          <div
            role="status"
            className="rounded-xl p-3 flex flex-wrap items-center gap-2 text-xs"
            style={{ background: 'rgba(232,197,106,0.08)', border: '1px solid rgba(232,197,106,0.25)', color: '#e8c56a' }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              Calls are loaded up to {data.latestCallDate}. Upload the Ultatel export for {data.missingUploadDay} so today&apos;s numbers include it.
            </span>
            <button
              onClick={() => setImportModalOpen(true)}
              className="font-num px-3 py-1 rounded-lg cursor-pointer"
              style={{ background: 'rgba(232,197,106,0.15)', color: '#e8c56a' }}
            >
              Upload now
            </button>
          </div>
        )}

        {data?.dataSourceInfo?.notes && (
          <div
            role="status"
            className="rounded-xl p-3 flex items-start gap-2 text-xs"
            style={{ background: 'rgba(232,197,106,0.08)', border: '1px solid rgba(232,197,106,0.25)', color: '#e8c56a' }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{data.dataSourceInfo.notes}</span>
          </div>
        )}

        {data && (
          <>
            <KpiGrid totals={data.totals} previous={prevTotals} goals={teamGoals} />

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
                  {tab.id === 'confirm' && data.totals.awaitingConfirmation > 0 && (
                    <span className="font-num text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(232,197,106,0.18)', color: '#e8c56a' }}>
                      {data.totals.awaitingConfirmation}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'today' && <TodayView meetings={data.confirmationQueue || []} dataAsOf={data.dataAsOf} pollFailed={pollFailed} />}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2"><FunnelChart totals={data.totals} /></div>
                  <AttentionPanel openers={agentsInView} attention={attention} targetsSet={Boolean(targets)} />
                </div>
                <DashboardCharts openers={data.openers} daily={data.dailyBreakdown} />
              </div>
            )}
            {activeTab === 'agents' && (
              <AgentDashboardView
                openers={data.openers}
                filters={filters}
                agentGoals={agentGoals}
                qualifiedTarget={targets?.qualifiedShows ? monthlyTargetForPeriod(targets.qualifiedShows, filters.startDate, filters.endDate) : undefined}
              />
            )}
            {activeTab === 'periods' && (
              <TrendsView daily={data.dailyBreakdown} weekly={data.weeklyBreakdown} monthly={data.monthlyBreakdown} view={periodView} onViewChange={setPeriodView} />
            )}
            {activeTab === 'table' && (
              <OpenerTable openers={data.openers} totals={data.totals} />
            )}
            {activeTab === 'confirm' && (
              <ConfirmationsView
                meetings={data.confirmationQueue || []}
                viewer={data.viewer}
                confirmationsAvailable={data.confirmationsAvailable !== false}
                onChanged={() => fetchData(false, true)}
              />
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

      {data && <PrintReport data={data} filters={filters} previous={prevTotals} attention={attention} />}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-elevated border border-white/12 px-4 py-2.5 text-sm shadow-2xl print:hidden">
          {toast}
        </div>
      )}
    </div>
  );
}
