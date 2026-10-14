'use client';

import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Search, Undo2 } from 'lucide-react';
import { MeetingRecord, ViewerInfo } from '@/types/dashboard';
import { LIKELY_SHOW_STAGES, NEVER_SHOW_STAGES } from '@/lib/stages';

interface Props {
  meetings: MeetingRecord[];
  viewer?: ViewerInfo;
  confirmationsAvailable: boolean;
  onChanged: () => void;
}

type StatusFilter = 'awaiting' | 'confirmed' | 'all';
const PAGE_SIZE = 20;

async function post(url: string, body: unknown): Promise<{ ok: boolean; json: { error?: string; changed?: number; message?: string; count?: number } }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

export const ConfirmationsView: React.FC<Props> = ({ meetings, viewer, confirmationsAvailable, onChanged }) => {
  const canConfirm = viewer?.role === 'admin' || viewer?.role === 'manager';
  const [status, setStatus] = useState<StatusFilter>('awaiting');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // No-Show and Dead Leads can never be shows, so they are not reviewed here.
  const reviewable = useMemo(() => meetings.filter((m) => m.meetingKey && !NEVER_SHOW_STAGES.includes(m.stage)), [meetings]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviewable
      .filter((m) => (status === 'all' ? true : status === 'confirmed' ? m.showConfirmed : !m.showConfirmed))
      .filter((m) => !q || [m.opener, m.companyName, m.authorizedPerson, m.stage].some((v) => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => {
        const likelyA = LIKELY_SHOW_STAGES.includes(a.stage) ? 0 : 1;
        const likelyB = LIKELY_SHOW_STAGES.includes(b.stage) ? 0 : 1;
        return likelyA - likelyB || (b.dateAdded || '').localeCompare(a.dateAdded || '');
      });
  }, [reviewable, status, search]);

  const awaitingCount = reviewable.filter((m) => !m.showConfirmed && LIKELY_SHOW_STAGES.includes(m.stage)).length;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((Math.min(page, totalPages) - 1) * PAGE_SIZE, Math.min(page, totalPages) * PAGE_SIZE);

  const submit = async (action: 'confirm' | 'revoke', keys: string[]) => {
    if (keys.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const { ok, json } = await post('/api/confirmations', { action, keys });
      if (!ok) throw new Error(json.error || 'Could not save');
      setMessage({ ok: true, text: `${json.changed ?? 0} meeting(s) ${action === 'confirm' ? 'confirmed as shows' : 'un-confirmed'}.${json.message ? ' ' + json.message : ''}` });
      setSelected(new Set());
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  };

  const bulkImport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const dry = await post('/api/confirmations/bulk', { dryRun: true });
      if (!dry.ok) throw new Error(dry.json.error || 'Could not check');
      const count = dry.json.count ?? 0;
      if (count === 0) {
        setMessage({ ok: true, text: 'Nothing to import: every meeting in a show stage is already confirmed.' });
        return;
      }
      if (!window.confirm(`Confirm ALL ${count} existing meetings that are in Follow Ups, Contract Sent, Invoice Sent, Onboarded or Temporary Inactive (any date) as shows? This is recorded in the audit log under your name.`)) return;
      const res = await post('/api/confirmations/bulk', { confirm: true });
      if (!res.ok) throw new Error(res.json.error || 'Import failed');
      setMessage({ ok: true, text: `${res.json.changed ?? 0} existing meetings confirmed.` });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Import failed' });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const pageKeys = pageRows.map((m) => m.meetingKey as string);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));

  return (
    <div className="card overflow-hidden">
      <div className="p-4 sm:px-6 space-y-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <div className="sec-tag mb-0.5">Management review</div>
          <h3 className="font-serif text-base font-bold text-white">Confirm shows</h3>
          <p className="label-caps mt-0.5">
            A meeting only counts as a show once it is confirmed here · {awaitingCount} in show stages awaiting confirmation (current date range)
          </p>
        </div>

        {!confirmationsAvailable && (
          <p role="alert" className="text-xs rounded-lg p-3" style={{ background: 'rgba(248,113,113,0.08)', color: '#fca5a5' }}>
            Confirmations could not be loaded, so no meeting is being counted as a show. Check the Supabase connection and that the latest <code>supabase_schema.sql</code> has been run.
          </p>
        )}
        {!canConfirm && <p className="text-xs text-[#a1a1aa]">Your account is view-only. Ask an admin for the manager role to confirm shows.</p>}
        {message && <p role="status" className="text-xs" style={{ color: message.ok ? '#4ade80' : '#fca5a5' }}>{message.text}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-white/4 border border-white/7 p-0.5 text-xs font-semibold">
            {(['awaiting', 'confirmed', 'all'] as StatusFilter[]).map((s) => (
              <button key={s} onClick={() => { setStatus(s); setPage(1); }} className={`px-3 min-h-8 rounded-md ${status === s ? 'bg-white text-black' : 'text-text-dim'}`}>
                {s === 'awaiting' ? 'Awaiting' : s === 'confirmed' ? 'Confirmed' : 'All'}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#71717a] absolute left-3 top-1/2 -translate-y-1/2" />
            <input aria-label="Search meetings" placeholder="Search company / opener…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="bg-white/4 border border-white/7 rounded-lg pl-8 pr-3 min-h-9 text-xs text-white focus:outline-none" />
          </div>
          {canConfirm && (
            <>
              <button disabled={busy || selected.size === 0} onClick={() => submit('confirm', Array.from(selected))}
                className="min-h-9 px-3 rounded-lg text-xs font-semibold bg-gold-dim border border-gold-border text-gold-light disabled:opacity-40">
                Confirm selected ({selected.size})
              </button>
              <button disabled={busy || selected.size === 0} onClick={() => submit('revoke', Array.from(selected))}
                className="min-h-9 px-3 rounded-lg text-xs font-semibold border border-white/10 text-text-dim disabled:opacity-40">
                Undo selected
              </button>
            </>
          )}
          {viewer?.role === 'admin' && (
            <button disabled={busy} onClick={bulkImport} className="min-h-9 px-3 rounded-lg text-xs font-semibold border border-white/10 text-text-dim disabled:opacity-40 ml-auto">
              One-time: confirm existing show-stage meetings
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[#a1a1aa]">
            <tr>
              {canConfirm && <th className="p-3 w-8"><input aria-label="Select all on page" type="checkbox" checked={allOnPage} onChange={() => setSelected((prev) => { const next = new Set(prev); pageKeys.forEach((k) => (allOnPage ? next.delete(k) : next.add(k))); return next; })} /></th>}
              <th className="p-3">Added</th><th className="p-3">Opener</th><th className="p-3">Company</th><th className="p-3">Contact</th><th className="p-3">Stage</th><th className="p-3">Status</th>
              {canConfirm && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m) => {
              const key = m.meetingKey as string;
              return (
                <tr key={key} className="border-t border-white/7">
                  {canConfirm && <td className="p-3"><input aria-label={`Select ${m.companyName || m.opener}`} type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} /></td>}
                  <td className="p-3 font-num whitespace-nowrap">{m.dateAdded || '—'}</td>
                  <td className="p-3">{m.opener}</td>
                  <td className="p-3">{m.companyName || '—'}</td>
                  <td className="p-3">{m.authorizedPerson || '—'}</td>
                  <td className="p-3 whitespace-nowrap">{m.stage}</td>
                  <td className="p-3 whitespace-nowrap">
                    {m.showConfirmed
                      ? <span className="inline-flex items-center gap-1 text-[#4ade80]"><CheckCircle2 className="w-3.5 h-3.5" />Confirmed by {m.confirmedBy}{m.confirmedAt ? ` · ${new Date(m.confirmedAt).toLocaleDateString()}` : ''}</span>
                      : <span className={LIKELY_SHOW_STAGES.includes(m.stage) ? 'text-[#e8c56a]' : 'text-[#71717a]'}>{LIKELY_SHOW_STAGES.includes(m.stage) ? 'Awaiting confirmation' : 'Not confirmed'}</span>}
                  </td>
                  {canConfirm && (
                    <td className="p-3 text-right">
                      <button disabled={busy} onClick={() => submit(m.showConfirmed ? 'revoke' : 'confirm', [key])}
                        className="inline-flex items-center gap-1 px-2.5 min-h-8 rounded-md border border-white/10 text-text-primary disabled:opacity-40">
                        {m.showConfirmed ? <><Undo2 className="w-3.5 h-3.5" />Undo</> : <><CheckCircle2 className="w-3.5 h-3.5 text-[#4ade80]" />Confirm show</>}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {pageRows.length === 0 && <tr><td className="p-6 text-center text-[#71717a]" colSpan={8}>{status === 'awaiting' ? 'Nothing is waiting for confirmation in this date range.' : 'No meetings match.'}</td></tr>}
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
