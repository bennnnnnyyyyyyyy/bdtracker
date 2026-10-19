import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { loadDashboardInputs } from '@/lib/dashboard-data';
import { resolveOpener } from '@/lib/analytics';
import { isExcludedAgent } from '@/lib/config';
import { clearRetirement, loadRetirements, setRetirement } from '@/lib/retirements';
import { getErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

async function roster(): Promise<string[]> {
  const { rawData } = await loadDashboardInputs();
  const names = new Set<string>();
  rawData.agentMappings.forEach((m) => {
    const o = resolveOpener(m.opener || m.agent, rawData.agentMappings);
    if (o && !isExcludedAgent(o)) names.add(o);
  });
  rawData.meetings.forEach((m) => { if (m.opener && !isExcludedAgent(m.opener)) names.add(m.opener); });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

// Agents who have left. Admins and managers only.
export async function GET(request: NextRequest) {
  const guard = await requireUser(request, ['admin', 'manager'], { read: true });
  if (guard.response) return guard.response;
  try {
    const [names, retired] = await Promise.all([roster(), loadRetirements()]);
    return NextResponse.json({
      available: retired !== null,
      agents: names.map((opener) => ({ opener, lastDay: retired?.[opener.toLowerCase()] ?? null })),
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to load agents' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request, ['admin', 'manager']);
  if (guard.response) return guard.response;
  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  const opener = String(body?.opener ?? '').trim();
  if ((action !== 'retire' && action !== 'reinstate') || !opener) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    const names = await roster();
    const match = names.find((n) => n.toLowerCase() === opener.toLowerCase());
    if (!match) return NextResponse.json({ error: 'Unknown agent.' }, { status: 404 });
    if (action === 'retire') {
      const lastDay = String(body?.lastDay ?? '');
      if (!YMD.test(lastDay)) return NextResponse.json({ error: 'Pick the last day the agent worked.' }, { status: 400 });
      await setRetirement(match, lastDay, guard.user.name);
    } else {
      await clearRetirement(match);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to save' }, { status: 500 });
  }
}
