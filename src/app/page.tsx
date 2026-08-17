'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { KpiGrid } from '@/components/KpiGrid';
import { DashboardCharts } from '@/components/DashboardCharts';
import { OpenerTable } from '@/components/OpenerTable';
import { CallLogsView } from '@/components/CallLogsView';
import { FilterState, DashboardResponse } from '@/types/dashboard';
import { BarChart3, Table as TableIcon, PhoneCall, AlertCircle, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const [filters, setFilters] = useState<FilterState>({
    startDate: '',
    endDate: '',
    selectedOpener: 'ALL',
    searchQuery: ''
  });

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'table' | 'calls'>('overview');

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
        throw new Error(`Failed to load dashboard data: ${res.statusText}`);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header Bar */}
      <Header
        filters={filters}
        onFilterChange={handleFilterChange}
        openers={data?.openers || []}
        onRefresh={() => fetchData(true)}
        loading={loading}
        lastUpdated={data?.lastUpdated || ''}
        isMockData={data?.isMockData}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error Banner if any */}
        {error && (
          <div className="bg-rose-950/50 border border-rose-800/80 rounded-xl p-4 flex items-center justify-between text-rose-300 text-sm">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-rose-400" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchData(true)}
              className="text-xs bg-rose-900/80 hover:bg-rose-800 text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Initial Loading Skeleton */}
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-slate-400 text-sm">Syncing live data from Google Sheets...</p>
          </div>
        ) : data ? (
          <>
            {/* Top KPI Cards */}
            <KpiGrid totals={data.totals} />

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 space-x-6 text-sm font-medium">
              <button
                onClick={() => setActiveTab('overview')}
                className={`pb-3 flex items-center space-x-2 cursor-pointer transition-all border-b-2 ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Visual Overview & Charts</span>
              </button>

              <button
                onClick={() => setActiveTab('table')}
                className={`pb-3 flex items-center space-x-2 cursor-pointer transition-all border-b-2 ${
                  activeTab === 'table'
                    ? 'border-blue-500 text-blue-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <TableIcon className="w-4 h-4" />
                <span>Opener Summary Table</span>
              </button>

              <button
                onClick={() => setActiveTab('calls')}
                className={`pb-3 flex items-center space-x-2 cursor-pointer transition-all border-b-2 ${
                  activeTab === 'calls'
                    ? 'border-blue-500 text-blue-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <PhoneCall className="w-4 h-4" />
                <span>Call Logs Drill-Down</span>
              </button>
            </div>

            {/* Tab Views */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <DashboardCharts openers={data.openers} />
                <OpenerTable openers={data.openers} totals={data.totals} />
              </div>
            )}

            {activeTab === 'table' && (
              <OpenerTable openers={data.openers} totals={data.totals} />
            )}

            {activeTab === 'calls' && (
              <CallLogsView calls={data.calls} />
            )}
          </>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-4 text-center text-xs text-slate-500">
        BD Call & Pipeline Dashboard • Connected to Google Sheets API v4
      </footer>
    </div>
  );
}
