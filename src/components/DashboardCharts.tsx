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
  ResponsiveContainer
} from 'recharts';
import { OpenerStats } from '@/types/dashboard';
import { CONFIG } from '@/lib/config';

interface DashboardChartsProps {
  openers: OpenerStats[];
}

const STAGE_COLORS: Record<string, string> = {
  'New Meetings': '#3B82F6', // Blue
  'Follow Ups': '#6366F1', // Indigo
  'Contract Sent': '#8B5CF6', // Purple
  'Invoice Sent': '#EC4899', // Pink
  'Onboarded': '#10B981', // Emerald
  'No-Show': '#F59E0B', // Amber
  'Dead Leads': '#EF4444', // Red
  'Temporary Inactive': '#64748B' // Slate
};

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ openers }) => {
  if (!openers || openers.length === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
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
    'Show Rate (%)': Number((o.showRate * 100).toFixed(1)),
    'Close Rate (%)': Number((o.closeRate * 100).toFixed(1))
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
    'Calls per Meeting': o.callsPerMeeting || 0
  }));

  return (
    <div className="space-y-6">
      {/* Top Row: Calls vs Booked & Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Calls Made vs Meetings Booked */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-white">Calls Made vs Meetings Booked</h3>
            <p className="text-xs text-slate-400">Comparing call volume against resulting booked meetings by opener</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={callsVsBookedData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="opener" stroke="#94A3B8" fontSize={11} angle={-25} textAnchor="end" />
                <YAxis stroke="#94A3B8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', color: '#F8FAFC' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="Calls Made" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Meetings Booked" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Show Rate vs Close Rate */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-white">Show Rate vs Close Rate</h3>
            <p className="text-xs text-slate-400">Meeting attendance rate vs final deal onboarding close rate (%)</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratesData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="opener" stroke="#94A3B8" fontSize={11} angle={-25} textAnchor="end" />
                <YAxis stroke="#94A3B8" fontSize={11} unit="%" />
                <Tooltip
                  formatter={(val: unknown) => [`${val}%`, '']}
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', color: '#F8FAFC' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="Show Rate (%)" fill="#6366F1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Close Rate (%)" fill="#EC4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row: Pipeline Stage Stacked Bar & Calls/Meeting */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 3. Pipeline Stages Stacked Bar (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-white">Pipeline Stage Breakdown by Opener</h3>
            <p className="text-xs text-slate-400">Distribution of leads across all 8 pipeline stages from BD Tracker</p>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="opener" stroke="#94A3B8" fontSize={11} angle={-25} textAnchor="end" />
                <YAxis stroke="#94A3B8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', color: '#F8FAFC' }}
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
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-white">Efficiency: Calls / Meeting</h3>
            <p className="text-xs text-slate-400">Lower numbers indicate higher conversion efficiency</p>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={efficiencyData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="opener" stroke="#94A3B8" fontSize={11} angle={-25} textAnchor="end" />
                <YAxis stroke="#94A3B8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', color: '#F8FAFC' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="Calls per Meeting" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
