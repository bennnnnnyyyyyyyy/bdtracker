'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { KpiGrid } from '@/components/KpiGrid';
import { OpenerTable } from '@/components/OpenerTable';
import { CallLogsView } from '@/components/CallLogsView';
import { AgentDashboardView } from '@/components/AgentDashboardView';
import { FilterState, DashboardResponse } from '@/types/dashboard';
import { AlertCircle, RefreshCw, LayoutGrid, Table as TableIcon, PhoneCall } from 'lucide-react';

type ActiveTab = 'agents' | 'table' | 'calls';

const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  { id: 'agents', label: 'Agents', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'table', label: 'Full Table', icon: <TableIcon className="w-4 h-4" /> },
  { id: 'calls', label: 'Call Logs', icon: <PhoneCall className="w-4 h-4" /> },
];

export default function DashboardPage() {
  const [filters, setFilters] = useState<FilterState>({
    startDate: '',
    endDate: '',
    selectedOpener: 'ALL',
    searchQuery: '',
    preset: 'all_time'
  });

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('agents');

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.selectedOpener && filters.selectedOpener !== 'ALL') {
        params.set('opener', filters.selectedOpener);
      }
      if (forceRefresh) params.set('refresh', 'true');

      const res = await fetch(`/api/dashboard?${params.toString()}`);
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
    } catch (err: unknown) {
      console.error('Error fetching dashboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

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
        {/* Error Banner */}
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

        {/* Loading */}
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <RefreshCw className="w-7 h-7 animate-spin" style={{ color: '#c9a84c' }} />
            <p className="label-caps">Syncing from Google Sheets…</p>
          </div>
        ) : data ? (
          <>
            <KpiGrid totals={data.totals} />

            {/* Tabs */}
            <div
              className="flex gap-0 text-sm font-medium overflow-x-auto"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
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

            <div className={activeTab === 'agents' ? 'block' : 'hidden'}>
              <AgentDashboardView
                openers={data.openers}
                totals={data.totals}
                filters={filters}
              />
            </div>
            <div className={activeTab === 'table' ? 'block' : 'hidden'}>
              <OpenerTable openers={data.openers} totals={data.totals} />
            </div>
            <div className={activeTab === 'calls' ? 'block' : 'hidden'}>
              <CallLogsView calls={data.calls} />
            </div>
          </>
        ) : null}
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
