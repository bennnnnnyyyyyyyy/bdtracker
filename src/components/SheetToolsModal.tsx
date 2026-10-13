'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Wrench, X } from 'lucide-react';

interface SheetStatus {
  activeRows: number;
  archives: { tab: string; rows: number }[];
  keepDays: number;
  autoArchive: { on: boolean; last: { at: string; ok: boolean; moved?: number; months?: string[]; error?: string; note?: string } | null };
  unmappedAgents: string[];
  check?: { duplicates: number; redated: number; rowsAfter: number };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onChanged: () => void;
}

async function call(action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'The action failed');
  return json;
}

function lastRunText(last: SheetStatus['autoArchive']['last']): string {
  if (!last) return 'No automatic run yet.';
  const when = new Date(last.at).toLocaleString();
  if (!last.ok) return `Last run ${when} failed: ${last.error}`;
  return last.moved ? `Last run ${when}: moved ${last.moved} rows into ${(last.months || []).join(', ')}.` : `Last run ${when}: ${last.note || 'nothing to move.'}`;
}

export const SheetToolsModal: React.FC<Props> = ({ isOpen, onClose, isAdmin, onChanged }) => {
  const [status, setStatus] = useState<SheetStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [openers, setOpeners] = useState<Record<string, string>>({});

  const run = useCallback(async (action: string, label: string, extra: Record<string, unknown> = {}, describe?: (r: Record<string, unknown>) => string) => {
    setBusy(action);
    setMessage(null);
    try {
      const result = await call(action, extra);
      if (result.status) setStatus(result.status as SheetStatus);
      else if (action === 'status' || action === 'check') setStatus(result as unknown as SheetStatus);
      setMessage({ ok: true, text: describe ? describe(result) : `${label} done.` });
      if (!['status', 'check', 'autoArchiveOn', 'autoArchiveOff'].includes(action)) onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'The action failed' });
    } finally {
      setBusy(null);
    }
  }, [onChanged]);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => run('status', 'Status'), 0);
    return () => window.clearTimeout(t);
  }, [isOpen, run]);

  if (!isOpen) return null;

  const btn = 'px-3 min-h-9 rounded-lg text-xs font-semibold border border-white/10 text-text-primary disabled:opacity-40 inline-flex items-center gap-1.5';
  const spinner = (a: string) => (busy === a ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="sheet-tools-title">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl" style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-4 h-4 text-[#e8c56a]" />
            <h2 id="sheet-tools-title" className="font-serif text-base font-bold text-white">Call log maintenance</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-5 text-xs text-slate-300">
          {message && (
            <p role="status" className={`p-3 rounded-lg flex items-start gap-2 ${message.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {message.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}<span>{message.text}</span>
            </p>
          )}

          <section className="space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Call Logs sheet</h3>
              <button onClick={() => run('status', 'Refresh')} disabled={busy !== null} className={btn} aria-label="Refresh status"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
            </div>
            {status ? (
              <>
                <p>{status.activeRows.toLocaleString()} rows in the active log (calls from the last {status.keepDays} days).</p>
                <p>{status.archives.length === 0 ? 'No monthly archive tabs yet.' : `Archive tabs: ${status.archives.map((a) => `${a.tab.replace('Call Logs ', '')} (${a.rows.toLocaleString()})`).join(', ')}.`}</p>
              </>
            ) : <p className="text-slate-500">Loading…</p>}
          </section>

          {isAdmin && (
            <>
              <section className="space-y-2">
                <h3 className="font-semibold text-white">Duplicates and call times</h3>
                <p className="text-slate-400">Finds calls that are in the sheet twice (for example one copy written with a “+”) and call times that are not on Cairo time.</p>
                {status?.check && (
                  <p className={status.check.duplicates + status.check.redated > 0 ? 'text-[#e8c56a]' : 'text-emerald-400'}>
                    {status.check.duplicates + status.check.redated > 0
                      ? `${status.check.duplicates} duplicate row(s) and ${status.check.redated} call time(s) to fix.`
                      : 'No duplicates and every call time is correct.'}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => run('check', 'Check')} disabled={busy !== null} className={btn}>{spinner('check')}Check now</button>
                  <button
                    onClick={() => run('repair', 'Repair', {}, (r) => {
                      const rep = r.repair as { skipped?: string; duplicates: number; redated: number; rows: number };
                      return rep.skipped ? `Nothing to repair (${rep.skipped}).` : `Removed ${rep.duplicates} duplicate row(s) and corrected ${rep.redated} call time(s); ${rep.rows.toLocaleString()} rows remain. A hidden backup sheet was saved.`;
                    })}
                    disabled={busy !== null}
                    className={btn}
                  >{spinner('repair')}Repair duplicates</button>
                  <button onClick={() => run('fixTimes', 'Fix call times', {}, (r) => `${(r as { changed: number }).changed} call time(s) corrected.`)} disabled={busy !== null} className={btn}>{spinner('fixTimes')}Fix call times</button>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold text-white">Monthly archive</h3>
                <p className="text-slate-400">Moves calls older than {status?.keepDays ?? 45} days into monthly tabs so the sheet stays fast.</p>
                <p>{status ? `Automatic archiving is ${status.autoArchive.on ? 'ON (every Sunday around 03:00)' : 'OFF'}. ${lastRunText(status.autoArchive.last)}` : ''}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => run('archive', 'Archive', {}, (r) => {
                      const a = r.archive as { moved: number; kept: number; months: string[]; skipped?: string };
                      return a.moved > 0 ? `Moved ${a.moved.toLocaleString()} rows into ${a.months.join(', ')}; ${a.kept.toLocaleString()} stay active.` : `Nothing to archive (${a.skipped}).`;
                    })}
                    disabled={busy !== null}
                    className={btn}
                  >{spinner('archive')}Archive old months now</button>
                  {status?.autoArchive.on
                    ? <button onClick={() => run('autoArchiveOff', 'Automatic archiving off', {}, () => 'Automatic archiving is OFF.')} disabled={busy !== null} className={btn}>{spinner('autoArchiveOff')}Turn off automatic archiving</button>
                    : <button onClick={() => run('autoArchiveOn', 'Automatic archiving on', {}, () => 'Automatic archiving is ON: every Sunday around 03:00.')} disabled={busy !== null} className={btn}>{spinner('autoArchiveOn')}Turn on automatic archiving</button>}
                </div>
              </section>
            </>
          )}

          <section className="space-y-2">
            <h3 className="font-semibold text-white">Agents without an Opener name</h3>
            {status && status.unmappedAgents.length === 0 && <p className="text-emerald-400">Every agent has an Opener name.</p>}
            {status && status.unmappedAgents.length > 0 && (
              <>
                <p className="text-slate-400">Type the name the BD tracker uses for each person (for example “Rick”) so their calls and meetings appear together. For people who are not on the BD team, type “ignore”: they disappear from every number (nothing is deleted, and you can change it later).</p>
                {status.unmappedAgents.map((agent) => (
                  <label key={agent} className="flex items-center gap-2">
                    <span className="w-44 shrink-0 truncate">{agent}</span>
                    <input
                      value={openers[agent] ?? ''}
                      onChange={(e) => setOpeners({ ...openers, [agent]: e.target.value })}
                      placeholder={agent.split(' ')[0]}
                      className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 text-xs focus:outline-none focus:border-[#e8c56a]"
                    />
                  </label>
                ))}
                <button
                  onClick={() => run('setMapping', 'Save names', { entries: Object.entries(openers).filter(([, v]) => v.trim()).map(([agent, opener]) => ({ agent, opener })) }, (r) => `Saved ${(r as { updated: number }).updated} name(s).`)}
                  disabled={busy !== null || !Object.values(openers).some((v) => v.trim())}
                  className={btn}
                >{spinner('setMapping')}Save names</button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
