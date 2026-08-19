export interface CallRecord {
  callDate: string;
  callId: string;
  from: string;
  to: string;
  extension: string;
  department: string;
  did: string;
  description: string;
  type: 'OUT-Bound' | 'IN-Bound' | string;
  outcome: 'ANSWERED' | 'NO ANSWER' | string;
  duration: string;
  durationSec: number;
  notes: string;
  callPath: string;
  agent: string;
  opener: string;
}

export interface MeetingRecord {
  stage: string;
  opener: string;
  dateAdded: string; // ISO YYYY-MM-DD or parsed date
  companyName?: string;
  authorizedPerson?: string;
}

export interface OpenerStats {
  opener: string;
  calls: number;
  outbound: number;
  inbound: number;
  answered: number;
  noAnswer: number;
  answerRate: number;
  connectionRate: number; // Answer rate (Connection rate)
  totalTalkSec: number;
  avgCallSec: number;
  booked: number;
  noShow: number;
  attended: number;
  showRate: number; // Attended / Booked
  onboarded: number;
  closeRate: number; // Onboarded / Booked
  callsPerMeeting: number;
  stageCounts: Record<string, number>;
  // Periodic averages
  dailyAverages?: {
    calls: number;
    meetings: number;
  };
  weeklyAverages?: {
    calls: number;
    meetings: number;
  };
  monthlyAverages?: {
    calls: number;
    meetings: number;
  };
}

export interface PeriodicAgentMetrics {
  periodKey: string; // e.g. "2026-08-15" (day) or "2026-W33" (week) or "2026-08" (month)
  periodLabel: string; // Formatted display label
  opener: string;
  calls: number;
  outbound: number;
  inbound: number;
  answered: number;
  connectionRate: number;
  meetings: number; // booked in this period
  noShow: number;
  attended: number;
  showRate: number;
  onboarded: number;
  closeRate: number;
  callsPerMeeting: number;
}

export interface PeriodicGroupSummary {
  periodKey: string;
  periodLabel: string;
  totals: {
    calls: number;
    answered: number;
    connectionRate: number;
    meetings: number;
    attended: number;
    showRate: number;
    onboarded: number;
    closeRate: number;
  };
  agents: PeriodicAgentMetrics[];
}

export interface OrgTotals {
  calls: number;
  outbound: number;
  inbound: number;
  answered: number;
  noAnswer: number;
  answerRate: number;
  connectionRate: number;
  totalTalkSec: number;
  avgCallSec: number;
  booked: number;
  noShow: number;
  attended: number;
  showRate: number;
  onboarded: number;
  closeRate: number;
  callsPerMeeting: number;
  stageCounts: Record<string, number>;
}

export interface AgentMapping {
  agent: string;
  opener: string;
}

export interface DashboardResponse {
  openers: OpenerStats[];
  totals: OrgTotals;
  calls: CallRecord[];
  agentMappings: AgentMapping[];
  stages: string[];
  lastUpdated: string;
  dailyBreakdown: PeriodicGroupSummary[];
  weeklyBreakdown: PeriodicGroupSummary[];
  monthlyBreakdown: PeriodicGroupSummary[];
  isMockData?: boolean;
  error?: string;
}

export type TimeGranularity = 'summary' | 'day' | 'week' | 'month';

export interface FilterState {
  startDate: string;
  endDate: string;
  selectedOpener: string;
  searchQuery: string;
  granularity?: TimeGranularity;
  preset?: 'today' | 'this_week' | 'this_month' | 'last_30_days' | 'all_time' | 'custom';
}

