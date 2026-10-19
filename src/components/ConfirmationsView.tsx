'use client';

import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Search, Undo2, UserX } from 'lucide-react';
import { MeetingRecord, ViewerInfo } from '@/types/dashboard';
import { CONFIRMATION_START_DATE } from '@/lib/stages';
import { CONFIG } from '@/lib/config';
import { canBeConfirmed, isAwaitingConfirmation, isConfirmedShow, needsReview } from '@/lib/meetings';

interface Props {
  meetings: MeetingRecord[];
  viewer?: ViewerInfo;
  confirmationsAvailable: boolean;
  onChanged: () => void;
}

type StatusFilter = 'awaiting' | 'review' | 'decided' | 'all';
type Outcome = 'show' | 'no_show' | null;
const PAGE_SIZE = 20;

async function post(url: string, body: unknown): Promise<{ ok: boolean; json: { error?: string; changed?: number } }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'awaiting', label: 'Awaiting' },
  { id: 'review', label: 'Needs review' },
  { id: 'decided', label: 'Decided' },
  { id: 'all', label: 'All' },
];

export const ConfirmationsView: React.FC<Props> = ({ meetings, viewer, confirmationsAvailable, onChanged }) => {
  const canConfirm = viewer?.role === 'admin' || viewer?.role === 'manager';
  const [status, setStatus] = useState<StatusFilter>('awaiting');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const reviewable = useMemo(() => meetings.filter((m) => canBeConfirmed(m)), [meetings]);
  const isDecided = (m: MeetingRecord) => Boolean(m.decision || m.sheetStage);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviewable
      .filter((m) => (status === 'all' ? true : status === 'decided' ? isDecided(m) : status === 'review' ? needsReview(m) : isAwaitingConfirmation(m)))
      .filter((m) => !q || [m.opener, m.companyName, m.authorizedPerson, m.stage, m.sheetStage].some((v) => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
  }, [reviewable, status, search]);

  const awaitingCount = reviewable.filter(isAwaitingConfirmation).length;
  const reviewCount = reviewable.filter(needsReview).length;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((Math.min(page, totalPages) - 1) * PAGE_SIZE, Math.min(page, totalPages) * PAGE_SIZE);

  const send = async (body: Record<string, unknown>, keys: string[], done: string) => {
    if (keys.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const { ok, json } = await post('/api/confirmations', { ...body, keys });
      if (!ok) throw new Error(json.error || 'Could not save');
      setMessage({ ok: true, text: `${json.changed ?? 0} meeting(s) ${done}.` });
      setSelected(new Set());
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  };
  const setOutcome = (keys: string[], outcome: Outcome) =>
    send({ action: 'set', outcome }, keys, outcome === 'show' ? 'marked as shows' : outcome === 'no_show' ? 'marked as no-shows' : 'updated');
  const setStage = (keys: string[], stage: string | null) => send({ action: 'set', stage }, keys, stage ? `moved to ${stage}` : 'moved back to the sheet stage');
  const clear = (keys: string[]) => send({ action: 'revoke' }, keys, 'cleared (back to the sheet stage and the default rules)');

  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const pageKeys = pageRows.map((m) => m.meetingKey as string);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const btn = 'inline-flex items-center gap-1 px-2.5 min-h-8 rounded-md border border-white/10 text-text-primary disabled:opacity-40 text-xs';

  return (
    <div className="card overflow-hidden">
      <div className="p-4 sm:px-6 space-y-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <div className="sec-tag mb-0.5">Management review</div>
          <h3 className="font-serif text-base font-bold text-white">Confirm shows</h3>
          <p className="label-caps mt-0.5">
            Mark each meeting a show or a no-show, and move it to a different stage than the tracker sheet if needed. Meetings added since {CONFIRMATION_START_DATE} only count as shows once marked here · {awaitingCount} awaiting a decision{reviewCount > 0 ? ` · ${reviewCount} marked as shows but back in New Meetings (check if they became No-Shows)` : ''}
          </p>
        </div>

        {!confirmationsAvailable && (
          <p role="alert" className="text-xs rounded-lg p-3" style={{ background: 'rgba(248,113,113,0.08)', color: '#fca5a5' }}>
            Confirmations could not be loaded, so no new meeting is being counted as a show. Check the Supabase connection and that the latest <code>supabase_schema.sql</code> has been run.
          </p>
        )}
        {!canConfirm && <p className="text-xs text-[#a1a1aa]">Your account is view-only. Ask an admin for the manager role to decide shows.</p>}
        {message && <p role="status" className="text-xs" style={{ color: message.ok ? '#4ade80' : '#fca5a5' }}>{message.text}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-white/4 border border-white/7 p-0.5 text-xs font-semibold">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => { setStatus(f.id); setPage(1); }} className={`px-3 min-h-8 rounded-md ${status === f.id ? 'bg-white text-black' : 'text-text-dim'}`}>{f.label}</button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#71717a] absolute left-3 top-1/2 -translate-y-1/2" />
            <input aria-label="Search meetings" placeholder="Search company / opener…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="bg-white/4 border border-white/7 rounded-lg pl-8 pr-3 min-h-9 text-xs text-white focus:outline-none" />
          </div>
        </div>

        {canConfirm && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/3 border border-white/7 p-2">
            <span className="text-xs text-text-dim px-1">{selected.size} selected</span>
            <button disabled={busy || selected.size === 0} onClick={() => setOutcome(Array.from(selected), 'show')} className={btn}><CheckCircle2 className="w-3.5 h-3.5 text-[#4ade80]" />Mark show</button>
            <button disabled={busy || selected.size === 0} onClick={() => setOutcome(Array.from(selected), 'no_show')} className={btn}><UserX className="w-3.5 h-3.5 text-[#fb923c]" />Mark no-show</button>
            <select aria-label="Move selected meetings to stage" value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} className="bg-white/4 border border-white/10 rounded-md px-2 min-h-8 text-xs text-white">
              <option value="">Move to stage…</option>
              {CONFIG.BD_TABS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button disabled={busy || selected.size === 0 || !bulkStage} onClick={() => setStage(Array.from(selected), bulkStage)} className={btn}>Move</button>
            <button disabled={busy || selected.size === 0} onClick={() => clear(Array.from(selected))} className={btn}><Undo2 className="w-3.5 h-3.5" />Clear decision</button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[#a1a1aa]">
            <tr>
              {canConfirm && <th className="p-3 w-8"><input aria-label="Select all on page" type="checkbox" checked={allOnPage} onChange={() => setSelected((prev) => { const next = new Set(prev); pageKeys.forEach((k) => (allOnPage ? next.delete(k) : next.add(k))); return next; })} /></th>}
              <th className="p-3">Added</th><th className="p-3">Opener</th><th className="p-3">Company</th><th className="p-3">Contact</th><th className="p-3">Sheet stage</th><th className="p-3">Counts as</th>
              {canConfirm && <th className="p-3">Decide</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m) => {
              const key = m.meetingKey as string;
              const sheetStage = m.sheetStage ?? m.stage;
              const counted = isConfirmedShow(m);
              return (
                <tr key={key} className="border-t border-white/7 align-top">
                  {canConfirm && <td className="p-3"><input aria-label={`Select ${m.companyName || m.opener}`} type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} /></td>}
                  <td className="p-3 font-num whitespace-nowrap">{m.dateAdded || '—'}</td>
                  <td className="p-3">{m.opener}</td>
                  <td className="p-3">{m.companyName || '—'}</td>
                  <td className="p-3">{m.authorizedPerson || '—'}</td>
                  <td className="p-3 whitespace-nowrap">{sheetStage}</td>
                  <td className="p-3 whitespace-nowrap">
                    {m.decision === 'show' && <span className="inline-flex items-center gap-1 text-[#4ade80]"><CheckCircle2 className="w-3.5 h-3.5" />Show{m.confirmedBy ? ` · ${m.confirmedBy}` : ''}{m.confirmedAt ? ` · ${new Date(m.confirmedAt).toLocaleDateString()}` : ''}</span>}
                    {m.decision === 'no_show' && <span className="inline-flex items-center gap-1 text-[#fb923c]"><UserX className="w-3.5 h-3.5" />No-show{m.confirmedBy ? ` · ${m.confirmedBy}` : ''}</span>}
                    {!m.decision && <span className={isAwaitingConfirmation(m) ? 'text-[#e8c56a]' : 'text-[#71717a]'}>{isAwaitingConfirmation(m) ? 'Awaiting decision' : counted ? 'Show (by tab, before the start date)' : 'Not a show'}</span>}
                    {m.sheetStage && m.decision !== 'no_show' && <div className="text-[#e8c56a] mt-0.5">Moved to {m.stage}</div>}
                    {needsReview(m) && <div className="text-[#e8c56a] mt-0.5">Back in New Meetings: set to no-show if it did not happen</div>}
                  </td>
                  {canConfirm && (
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button disabled={busy || m.decision === 'show'} onClick={() => setOutcome([key], 'show')} className={btn}><CheckCircle2 className="w-3.5 h-3.5 text-[#4ade80]" />Show</button>
                        <button disabled={busy || m.decision === 'no_show'} onClick={() => setOutcome([key], 'no_show')} className={btn}><UserX className="w-3.5 h-3.5 text-[#fb923c]" />No-show</button>
                        <select aria-label={`Stage for ${m.companyName || m.opener}`} disabled={busy} value={m.decision === 'no_show' ? sheetStage : (m.sheetStage ? m.stage : sheetStage)}
                          onChange={(e) => setStage([key], e.target.value)} className="bg-white/4 border border-white/10 rounded-md px-2 min-h-8 text-xs text-white">
                          {CONFIG.BD_TABS.map((t) => <option key={t} value={t}>{t}{t === sheetStage ? ' (sheet)' : ''}</option>)}
                        </select>
                        {isDecided(m) && <button disabled={busy} onClick={() => clear([key])} className={btn} aria-label="Clear decision"><Undo2 className="w-3.5 h-3.5" /></button>}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {pageRows.length === 0 && <tr><td className="p-6 text-center text-[#71717a]" colSpan={8}>{status === 'awaiting' ? 'Nothing is waiting for a decision.' : 'No meetings match.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between p-3 text-xs text-[#a1a1aa]" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <span>{rows.length} meeting(s)</span>
        <div className="flex items-center gap-2">
          <button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
          <span>{Math.min(page, totalPages)} / {totalPages}</span>
          <button aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
};
