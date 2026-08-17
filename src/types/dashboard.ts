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

export interface OpenerStats {
  opener: string;
  calls: number;
  outbound: number;
  inbound: number;
  answered: number;
  noAnswer: number;
  answerRate: number;
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

export interface OrgTotals {
  calls: number;
  outbound: number;
  inbound: number;
  answered: number;
  noAnswer: number;
  answerRate: number;
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
  isMockData?: boolean;
  error?: string;
}

export interface FilterState {
  startDate: string;
  endDate: string;
  selectedOpener: string;
  searchQuery: string;
}
