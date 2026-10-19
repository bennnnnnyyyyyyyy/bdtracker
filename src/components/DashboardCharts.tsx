'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  LabelList
} from 'recharts';
import { OpenerStats, PeriodicGroupSummary } from '@/types/dashboard';
import { CONFIG } from '@/lib/config';

interface DashboardChartsProps {
  openers: OpenerStats[];
  daily?: PeriodicGroupSummary[];
}

const STAGE_COLORS: Record<string, string> = {
  'New Meetings': '#a1a1aa', // Blue
  'Follow Ups': '#71717a', // Indigo
  'Contract Sent': '#c9a84c', // Purple
  'Invoice Sent': '#e8c56a', // Pink
  'Onboarded': '#35e58a', // Emerald
  'No-Show': '#fb923c', // Amber
  'Dead Leads': '#ff6675', // Red
  'Temporary Inactive': '#52525b', // Slate
  'DISQUALIFIED': '#a78bfa', // Violet
  'CANCELLED': '#94a3b8' // Gray
};

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ openers, daily = [] }) => {
  if (!openers || openers.length === 0) {
    return (
      <div className="card p-8 text-center text-text-dim">
        No opener data available for chart rendering.
      </div>
    );
  }

  // Data formatted for Chart 1: Calls vs Booked
  const callsVsBookedData = openers.map(o => ({
    opener: o.opener,
    'Calls Made': o.calls,
    'Meetings Booked': o.booked
  }));

  // Data formatted for Chart 2: Show Rate vs Close Rate
  const ratesData = openers.map(o => ({
    opener: o.opener,
    // No bar when there is nothing to measure (no results yet / no rated meetings), instead of a misleading 0.
    'Show Rate (%)': o.attended + o.noShow > 0 ? Number((o.showRate * 100).toFixed(1)) : null,
    'Close Rate (%)': o.ratedMeetings > 0 ? Number((o.closeRate * 100).toFixed(1)) : null
  }));

  // Data formatted for Chart 3: Pipeline stages
  const pipelineData = openers.map(o => {
    const item: Record<string, string | number> = { opener: o.opener };
    CONFIG.BD_TABS.forEach(tab => {
      item[tab] = o.stageCounts[tab] || 0;
    });
    return item;
  });

  // Data formatted for Chart 4: Calls per Meeting (Efficiency)
  const efficiencyData = openers.map(o => ({
    opener: o.opener,
    'Calls per Meeting': o.callsPerMeeting > 0 ? o.callsPerMeeting : null
  }));

  const trendData = [...daily].sort((a, b) => a.periodKey.localeCompare(b.periodKey)).map(d => ({
    period: d.periodLabel,
    Calls: d.totals.calls,
    Meetings: d.totals.meetings
  }));

  return (
    <div className="space-y-6">
      {trendData.length > 1 && (
        <div className="card p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-white">Daily trend</h3>
            <p className="text-xs text-text-dim mt-0.5">Calls and meetings booked per day across the selected period</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="period" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis yAxisId="calls" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis yAxisId="mtg" orientation="right" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1e1e23', borderColor: 'rgba(255,255,255,0.12)', borderRadius: '8px', color: '#f4f4f5' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line yAxisId="calls" type="monotone" dataKey="Calls" stroke="#c9a84c" strokeWidth={2} dot={false} />
                <Line yAxisId="mtg" type="monotone" dataKey="Meetings" stroke="#35e58a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top Row: Calls vs Booked & Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Calls Made vs Meetings Booked */}
        <div className="card p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-white">Calls Made vs Meetings Booked</h3>
            <p className="text-xs text-text-dim mt-0.5">Call volume (left axis) against meetings booked (right axis) by agent</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={callsVsBookedData} margin={{ top: 10, right: 0, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="opener" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis yAxisId="calls" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis yAxisId="mtg" orientation="right" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e1e23', borderColor: 'rgba(255,255,255,0.12)', borderRadius: '8px', color: '#f4f4f5' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar yAxisId="calls" dataKey="Calls Made" fill="#71717a" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="mtg" dataKey="Meetings Booked" fill="#c9a84c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Show Rate vs Close Rate */}
        <div className="card p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-white">Show Rate vs Close Rate</h3>
            <p className="text-xs text-text-dim mt-0.5">Confirmed show rate vs close rate (%). Agents with no results yet have no bar.</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratesData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="opener" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11}  />
                <YAxis stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} unit="%" />
                <Tooltip
                  formatter={(val: unknown) => [`${val}%`, '']}
                  contentStyle={{ backgroundColor: '#1e1e23', borderColor: 'rgba(255,255,255,0.12)', borderRadius: '8px', color: '#f4f4f5' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="Show Rate (%)" fill="#c9a84c" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Close Rate (%)" fill="#35e58a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row: Pipeline Stage Stacked Bar & Calls/Meeting */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 3. Pipeline Stages Stacked Bar (2 cols) */}
        <div className="lg:col-span-2 card p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-white">Pipeline Stage Breakdown by Opener</h3>
            <p className="text-xs text-text-dim mt-0.5">Distribution of leads across all {CONFIG.BD_TABS.length} tracker tabs</p>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="opener" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11}  />
                <YAxis stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e1e23', borderColor: 'rgba(255,255,255,0.12)', borderRadius: '8px', color: '#f4f4f5' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                {CONFIG.BD_TABS.map(tab => (
                  <Bar
                    key={tab}
                    dataKey={tab}
                    stackId="a"
                    fill={STAGE_COLORS[tab] || '#CBD5E1'}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. Efficiency: Calls per Meeting Booked (1 col) */}
        <div className="card p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-white">Efficiency: Calls / Meeting</h3>
            <p className="text-xs text-text-dim mt-0.5">Lower numbers indicate higher conversion efficiency</p>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={efficiencyData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="opener" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11}  />
                <YAxis stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e1e23', borderColor: 'rgba(255,255,255,0.12)', borderRadius: '8px', color: '#f4f4f5' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="Calls per Meeting" fill="#c9a84c" radius={[4, 4, 0, 0]}><LabelList dataKey="Calls per Meeting" position="top" fill="#f4f4f5" fontSize={11} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
