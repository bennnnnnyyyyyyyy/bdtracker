import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { loadDashboardInputs } from '@/lib/dashboard-data';
import { applyDecisions, Decision } from '@/lib/confirmations';
import { canBeConfirmed } from '@/lib/meetings';
import { CONFIG } from '@/lib/config';

export const runtime = 'nodejs';

type Outcome = 'show' | 'no_show' | null;

// Managers decide meetings: mark a show or a no-show, move it to another stage than the tracker sheet shows, or clear the
// decision. Admins and managers only. Keys are validated against the current tracker data.
//   { action: 'confirm' | 'revoke', keys }                      (confirm = show, revoke = clear everything)
//   { action: 'set', keys, outcome?: 'show'|'no_show'|null, stage?: <tab>|null }   (omitted fields stay as they are)
export async function POST(request: NextRequest) {
  const guard = await requireUser(request, ['admin', 'manager']);
  if (guard.response) return guard.response;

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  const keys: unknown = body?.keys;
  if (action !== 'confirm' && action !== 'revoke' && action !== 'set') return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 500 || keys.some((k) => typeof k !== 'string')) {
    return NextResponse.json({ error: 'Select between 1 and 500 meetings.' }, { status: 400 });
  }
  if (action === 'set') {
    if (body.outcome !== undefined && body.outcome !== null && body.outcome !== 'show' && body.outcome !== 'no_show') return NextResponse.json({ error: 'Invalid outcome.' }, { status: 400 });
    if (body.stage !== undefined && body.stage !== null && !CONFIG.BD_TABS.includes(body.stage)) return NextResponse.json({ error: 'Unknown stage.' }, { status: 400 });
  }

  try {
    const { rawData } = await loadDashboardInputs();
    const byKey = new Map(rawData.meetings.map((m) => [m.meetingKey as string, m]));
    const wanted = Array.from(new Set(keys as string[]));
    const found = wanted.map((k) => byKey.get(k)).filter((m): m is NonNullable<typeof m> => m !== undefined && canBeConfirmed(m));

    const decisions: Decision[] = found.map((m) => {
      const currentStage = m.sheetStage && m.decision !== 'no_show' ? m.stage : null; // a stage override set in the app, not the sheet's own stage
      if (action === 'revoke') return { meeting: m, outcome: null, stage: null };
      if (action === 'confirm') return { meeting: m, outcome: 'show', stage: currentStage };
      let outcome: Outcome = m.decision ?? null;
      let stage: string | null = m.decision === 'no_show' ? null : currentStage;
      if (body.outcome !== undefined) {
        outcome = body.outcome;
        if (outcome === 'no_show') stage = null; // a no-show is the No-Show stage
      }
      if (body.stage !== undefined) {
        stage = body.stage === (m.sheetStage ?? m.stage) ? null : body.stage; // choosing the sheet's own stage clears the override
        if (stage && outcome === 'no_show') outcome = null; // moving it to a stage replaces a no-show decision
      }
      return { meeting: m, outcome, stage };
    });

    const changed = await applyDecisions(decisions, guard.user);
    return NextResponse.json({ success: true, changed, skipped: wanted.length - changed });
  } catch (error) {
    console.error('Confirmation failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save confirmations' }, { status: 500 });
  }
}
