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
  /** How many calls this record stands for (daily totals from the Total Calls Per Extension report); 1 when absent. */
  weight?: number;
  /** Text of the sheet row as read (internal, used to tell copies of a row from repeated rows). */
  rowSignature?: string;
}

export interface MeetingRecord {
  stage: string;
  opener: string;
  dateAdded: string; // ISO YYYY-MM-DD or parsed date
  /** True when this meeting was rescheduled: it follows the confirmation rules whatever its Date Added. */
  rescheduled?: boolean;
  /** The tracker's Status column (e.g. "Rescheduled", "Follow Up"). */
  status?: string;
  companyName?: string;
  authorizedPerson?: string;
  medB?: boolean;
  ppo?: boolean;
  /** Stable identity used to attach a management show-confirmation to a tracker row. */
  meetingKey?: string;
  /** True once management confirmed the meeting was a show (never inferred from the stage). */
  showConfirmed?: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
}

export type UserRole = 'admin' | 'manager' | 'viewer';

export interface ViewerInfo {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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
  booked: number; // Current pipeline records (all stages)
  medBCount: number;
  medBRate: number; // Med B percentage: medBCount / booked
  ppoCount: number;
  ppoRate: number; // PPO percentage: ppoCount / booked
  noShow: number;
  attended: number; // Meetings confirmed as shows by management
  awaitingConfirmation: number; // Meetings in likely-show stages not yet confirmed
  showRate: number; // Attended / (Attended + No-Show); pending records excluded
  onboarded: number;
  closeRate: number; // Onboarded / Booked
  callsPerMeeting: number;
  stageCounts: Record<string, number>;
  // Present Days & Daily Calls based strictly on Present Days
  presentDays: number;
  callsPerPresentDay: number;
  adherenceRate?: number;
  activeDays?: number;
  callsPerCalendarDay?: number;
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
  noAnswer: number;
  connectionRate: number;
  meetings: number; // pipeline records created in this period
  noShow: number;
  attended: number;
  showRate: number;
  onboarded: number;
  closeRate: number;
  callsPerMeeting: number;
  presentDays: number;
  callsPerPresentDay: number;
}

export interface PeriodicGroupSummary {
  periodKey: string;
  periodLabel: string;
  totals: {
    calls: number;
    answered: number;
    noAnswer: number;
    connectionRate: number;
    meetings: number;
    attended: number;
    showRate: number;
    onboarded: number;
    closeRate: number;
    presentDays?: number;
    callsPerPresentDay?: number;
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
  medBCount: number;
  medBRate: number;
  ppoCount: number;
  ppoRate: number;
  noShow: number;
  attended: number;
  /** Meetings in likely-show stages that management has not confirmed yet. */
  awaitingConfirmation: number;
  showRate: number;
  onboarded: number;
  closeRate: number;
  callsPerMeeting: number;
  stageCounts: Record<string, number>;
  totalPresentDays: number;
  callsPerPresentDay: number;
  adherenceRate?: number;
  callsPerCalendarDay?: number;
}

export interface AgentMapping {
  agent: string;
  opener: string;
}

export interface DataSourceInfo {
  source: 'google_sheets' | 'local_excel' | 'supabase';
  attendanceSource: 'google_sheets' | 'local_excel' | 'none';
  callsSource: 'google_sheets' | 'ultatel_dept_report' | 'call_logs' | 'daily_totals' | 'supabase';
  notes?: string;
}

export interface DashboardResponse {
  openers: OpenerStats[];
  totals: OrgTotals;
  /** Empty unless the request asked for `includeCalls=true` (the Call Logs tab loads them on demand). */
  calls: CallRecord[];
  callsIncluded?: boolean;
  callsTotal?: number;
  meetings?: MeetingRecord[];
  /** Every reviewable meeting regardless of the selected dates (the Confirm shows tab). */
  confirmationQueue?: MeetingRecord[];
  agentMappings: AgentMapping[];
  stages: string[];
  lastUpdated: string;
  dailyBreakdown: PeriodicGroupSummary[];
  weeklyBreakdown: PeriodicGroupSummary[];
  monthlyBreakdown: PeriodicGroupSummary[];
  isMockData?: boolean;
  dataSourceInfo?: DataSourceInfo;
  /** When the underlying sheets were actually read (not when this response was built). */
  dataAsOf?: string;
  /** Newest call day (YYYY-MM-DD) in the loaded call logs; drives the upload reminder. */
  latestCallDate?: string;
  /** Set when the export of this working day has not been uploaded yet (managers see a reminder). */
  missingUploadDay?: string;
  /** False when the confirmation store could not be read; no meeting is counted as a show then. */
  confirmationsAvailable?: boolean;
  viewer?: ViewerInfo;
  error?: string;
}

export type TimeGranularity = 'summary' | 'day' | 'week' | 'month';

export interface FilterState {
  startDate: string;
  endDate: string;
  selectedOpener: string;
  searchQuery: string;
  granularity?: TimeGranularity;
  preset?: 'today' | 'this_week' | 'this_month' | 'last_30_days' | 'custom';
}

