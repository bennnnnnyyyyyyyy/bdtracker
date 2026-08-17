'use client';

import React from 'react';
import { Phone, CalendarCheck, CheckCircle, Clock, TrendingUp, PhoneForwarded } from 'lucide-react';
import { OrgTotals } from '@/types/dashboard';
import { formatMinutes, formatPercent } from '@/lib/analytics';

interface KpiGridProps {
  totals: OrgTotals;
}

export const KpiGrid: React.FC<KpiGridProps> = ({ totals }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. Total Calls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Calls Made</span>
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
            <Phone className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-white tracking-tight">
            {totals.calls.toLocaleString()}
          </div>
          <div className="flex items-center text-xs text-slate-400 mt-1 space-x-2">
            <span>Out: <strong className="text-slate-200">{totals.outbound.toLocaleString()}</strong></span>
            <span>•</span>
            <span>In: <strong className="text-slate-200">{totals.inbound.toLocaleString()}</strong></span>
          </div>
        </div>
        <div className="absolute top-0 left-0 h-1 w-full bg-blue-500 rounded-t-xl" />
      </div>

      {/* 2. Answer Rate & Talk Time */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Answer Rate</span>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <PhoneForwarded className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-emerald-400 tracking-tight">
            {formatPercent(totals.answerRate)}
          </div>
          <div className="flex items-center text-xs text-slate-400 mt-1 space-x-2">
            <span>Talk: <strong className="text-slate-200">{formatMinutes(totals.totalTalkSec)}</strong></span>
            <span>•</span>
            <span>Avg: <strong className="text-slate-200">{totals.avgCallSec}s</strong></span>
          </div>
        </div>
        <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500 rounded-t-xl" />
      </div>

      {/* 3. Meetings Booked & Show Rate */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Meetings Booked</span>
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
            <CalendarCheck className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-white tracking-tight">
            {totals.booked.toLocaleString()}
          </div>
          <div className="flex items-center text-xs text-slate-400 mt-1 space-x-2">
            <span>Attended: <strong className="text-slate-200">{totals.attended}</strong></span>
            <span>•</span>
            <span className="text-indigo-400 font-medium">Show: {formatPercent(totals.showRate)}</span>
          </div>
        </div>
        <div className="absolute top-0 left-0 h-1 w-full bg-indigo-500 rounded-t-xl" />
      </div>

      {/* 4. Onboarded & Close Rate */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Onboarded / Closed</span>
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
            <CheckCircle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-purple-400 tracking-tight">
            {totals.onboarded.toLocaleString()}
          </div>
          <div className="flex items-center text-xs text-slate-400 mt-1 space-x-2">
            <span>No-Shows: <strong className="text-amber-400">{totals.noShow}</strong></span>
            <span>•</span>
            <span className="text-purple-400 font-medium">Close: {formatPercent(totals.closeRate)}</span>
          </div>
        </div>
        <div className="absolute top-0 left-0 h-1 w-full bg-purple-500 rounded-t-xl" />
      </div>

      {/* 5. Calls Per Meeting (Efficiency) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Calls / Meeting</span>
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-amber-400 tracking-tight">
            {totals.callsPerMeeting || 0}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Calls required per booked meeting
          </div>
        </div>
        <div className="absolute top-0 left-0 h-1 w-full bg-amber-500 rounded-t-xl" />
      </div>
    </div>
  );
};
