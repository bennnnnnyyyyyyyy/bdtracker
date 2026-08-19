'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { KpiGrid } from '@/components/KpiGrid';
import { OpenerTable } from '@/components/OpenerTable';
import { CallLogsView } from '@/components/CallLogsView';
import { PeriodicBreakdownTable } from '@/components/PeriodicBreakdownTable';
import { FilterState, DashboardResponse } from '@/types/dashboard';
import { AlertCircle, RefreshCw, BarChart3, CalendarDays, CalendarRange, CalendarCheck2, Table as TableIcon, PhoneCall } from 'lucide-react';

type ActiveTab = 'summary' | 'daily' | 'weekly' | 'monthly' | 'table' | 'calls';

const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  { id: 'summary', label: 'Summary', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'daily', label: 'Daily', icon: <CalendarDays className="w-4 h-4" /> },
  { id: 'weekly', label: 'Weekly', icon: <CalendarRange className="w-4 h-4" /> },
  { id: 'monthly', label: 'Monthly', icon: <CalendarCheck2 className="w-4 h-4" /> },
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('summary');

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

        {/* Loading skeleton */}
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-slate-400 text-sm">Syncing live data from Google Sheets...</p>
          </div>
        ) : data ? (
          <>
            {/* KPI Cards — always visible */}
            <KpiGrid totals={data.totals} />

            {/* Tab Navigation */}
            <div className="flex border-b border-slate-800 gap-1 text-sm font-medium overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-3 pt-1 px-4 flex items-center gap-2 cursor-pointer transition-all border-b-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400 font-semibold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Panels (Kept in DOM with CSS display toggling for 0ms lag-free tab switching) */}
            <div className={activeTab === 'summary' || activeTab === 'table' ? 'block' : 'hidden'}>
              <OpenerTable openers={data.openers} totals={data.totals} />
            </div>

            <div className={activeTab === 'daily' ? 'space-y-3' : 'hidden'}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Daily Breakdown</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Calls, meetings, show rate & close rate per agent per day</p>
                </div>
                <span className="text-xs text-slate-500">{data.dailyBreakdown.length} days</span>
              </div>
              <PeriodicBreakdownTable
                data={data.dailyBreakdown}
                emptyLabel="No daily data in the selected date range."
              />
            </div>

            <div className={activeTab === 'weekly' ? 'space-y-3' : 'hidden'}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Weekly Breakdown</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Calls, meetings, show rate & close rate per agent per week</p>
                </div>
                <span className="text-xs text-slate-500">{data.weeklyBreakdown.length} weeks</span>
              </div>
              <PeriodicBreakdownTable
                data={data.weeklyBreakdown}
                emptyLabel="No weekly data in the selected date range."
              />
            </div>

            <div className={activeTab === 'monthly' ? 'space-y-3' : 'hidden'}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Monthly Breakdown</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Calls, meetings, show rate & close rate per agent per month</p>
                </div>
                <span className="text-xs text-slate-500">{data.monthlyBreakdown.length} months</span>
              </div>
              <PeriodicBreakdownTable
                data={data.monthlyBreakdown}
                emptyLabel="No monthly data in the selected date range."
              />
            </div>

            <div className={activeTab === 'calls' ? 'block' : 'hidden'}>
              <CallLogsView calls={data.calls} />
            </div>
          </>
        ) : null}
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-4 text-center text-xs text-slate-500">
        BD Call & Pipeline Dashboard · Google Sheets API v4
      </footer>

    </div>
  );
}


