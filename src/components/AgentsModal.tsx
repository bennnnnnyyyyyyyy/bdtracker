'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, UserMinus, X } from 'lucide-react';

interface AgentRow { opener: string; lastDay: string | null }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a change so the dashboard re-reads the data. */
  onChanged: () => void;
}

const dateInput = 'bg-white/4 border border-white/10 rounded-lg px-2 min-h-8 text-xs text-white focus:outline-none';

export const AgentsModal: React.FC<Props> = ({ isOpen, onClose, onChanged }) => {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [days, setDays] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agents', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load agents');
      setAgents(json.agents);
      setAvailable(json.available !== false);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not load agents' });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => { setMessage(null); void load(); }, 0);
    return () => window.clearTimeout(t);
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const send = async (opener: string, action: 'retire' | 'reinstate', lastDay?: string) => {
    setBusy(opener);
    setMessage(null);
    try {
      const res = await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, opener, lastDay }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save');
      setMessage({ ok: true, text: action === 'retire' ? `${opener} is retired after ${lastDay}.` : `${opener} is active again.` });
      await load();
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-labelledby="agents-title">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl bg-surface border border-white/12">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <UserMinus className="w-4 h-4 text-gold-light" />
            <h2 id="agents-title" className="font-serif text-base font-bold text-white">Manage agents</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-icon border-transparent bg-transparent text-text-dim hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4 text-xs text-slate-300">
          <p>Retire an agent who has left with their last working day. Their history stays in every range that includes those days; they simply stop appearing in ranges that start after it.</p>
          {!available && <p role="alert" className="p-3 rounded-lg bg-rose-500/10 text-rose-400">Retirements could not be loaded. Run the latest <code>supabase_schema.sql</code> and check the Supabase connection.</p>}
          {message && (
            <p role="status" className={`p-3 rounded-lg flex items-start gap-2 ${message.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {message.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}<span>{message.text}</span>
            </p>
          )}
          <ul className="divide-y divide-white/7 rounded-lg border border-white/10">
            {agents.map((a) => (
              <li key={a.opener} className="p-3 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white w-28 truncate">{a.opener}</span>
                {a.lastDay ? (
                  <>
                    <span className="text-[#e8c56a]">Left · last day {a.lastDay}</span>
                    <button disabled={busy === a.opener} onClick={() => void send(a.opener, 'reinstate')} className="ml-auto btn">Reinstate</button>
                  </>
                ) : (
                  <>
                    <span className="text-success">Active</span>
                    <span className="ml-auto flex items-center gap-2">
                      <input type="date" aria-label={`Last day for ${a.opener}`} value={days[a.opener] ?? ''} onChange={(e) => setDays({ ...days, [a.opener]: e.target.value })} className={dateInput} />
                      <button disabled={busy === a.opener || !days[a.opener] || !available} onClick={() => void send(a.opener, 'retire', days[a.opener])} className="btn">Retire</button>
                    </span>
                  </>
                )}
              </li>
            ))}
            {agents.length === 0 && <li className="p-4 text-center text-text-dim">No agents found.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};
