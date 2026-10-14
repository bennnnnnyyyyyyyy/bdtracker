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
  'New Meetings': '#71717a', // Blue
  'Follow Ups': '#a1a1aa', // Indigo
  'Contract Sent': '#c9a84c', // Purple
  'Invoice Sent': '#e8c56a', // Pink
  'Onboarded': '#35e58a', // Emerald
  'No-Show': '#fb923c', // Amber
  'Dead Leads': '#ff6675', // Red
  'Temporary Inactive': '#3f3f46' // Slate
};

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ openers }) => {
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
        <div className="card p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-white">Calls Made vs Meetings Booked</h3>
            <p className="text-xs text-text-dim mt-0.5">Comparing call volume against resulting booked meetings by opener</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={callsVsBookedData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="opener" stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11}  />
                <YAxis stroke="#8b8b94" tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e1e23', borderColor: 'rgba(255,255,255,0.12)', borderRadius: '8px', color: '#f4f4f5' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="Calls Made" fill="#c9a84c" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Meetings Booked" fill="#35e58a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Show Rate vs Close Rate */}
        <div className="card p-5">
          <div className="mb-4">
            <h3 className="font-serif text-base font-bold text-white">Show Rate vs Close Rate</h3>
            <p className="text-xs text-text-dim mt-0.5">Meeting attendance rate vs final deal onboarding close rate (%)</p>
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
                <Bar dataKey="Show Rate (%)" fill="#e8c56a" radius={[4, 4, 0, 0]} />
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
            <p className="text-xs text-text-dim mt-0.5">Distribution of leads across all 8 pipeline stages from BD Tracker</p>
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
                <Bar dataKey="Calls per Meeting" fill="#c9a84c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
