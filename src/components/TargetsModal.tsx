'use client';

import React, { useEffect, useState } from 'react';
import { Target, X } from 'lucide-react';
import { Targets } from '@/lib/targets';

interface Props {
  isOpen: boolean;
  current: Targets | null;
  onClose: () => void;
  onSave: (targets: Targets | null) => void;
}

const FIELDS: { key: keyof Targets; label: string; hint: string }[] = [
  { key: 'calls', label: 'Calls', hint: 'per agent, per week' },
  { key: 'meetings', label: 'Meetings booked', hint: 'per agent, per week' },
  { key: 'onboarded', label: 'Onboarded', hint: 'per agent, per week' },
];

export const TargetsModal: React.FC<Props> = ({ isOpen, current, onClose, onSave }) => {
  const [values, setValues] = useState<Record<keyof Targets, string>>({ calls: '', meetings: '', onboarded: '' });

  useEffect(() => {
    if (!isOpen) return;
    setValues({ calls: String(current?.calls || ''), meetings: String(current?.meetings || ''), onboarded: String(current?.onboarded || '') });
  }, [isOpen, current]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t: Targets = { calls: Math.max(0, Number(values.calls) || 0), meetings: Math.max(0, Number(values.meetings) || 0), onboarded: Math.max(0, Number(values.onboarded) || 0) };
    onSave(t.calls || t.meetings || t.onboarded ? t : null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="targets-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl bg-surface border border-white/12">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gold-dim border border-gold-border"><Target className="w-4 h-4 text-gold-light" /></div>
            <div>
              <h2 id="targets-title" className="font-serif text-lg font-bold text-white">Weekly targets</h2>
              <p className="text-xs text-text-dim mt-0.5">Per agent. Scaled to the selected period and team size.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-icon border-transparent bg-transparent text-text-dim hover:text-white" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {FIELDS.map(f => (
            <label key={f.key} className="flex items-center justify-between gap-4">
              <span><span className="block text-sm text-text-primary">{f.label}</span><span className="block text-xs text-text-dim">{f.hint}</span></span>
              <input type="number" min={0} inputMode="numeric" value={values[f.key]} onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                placeholder="Not set" className="field w-28 text-right" />
            </label>
          ))}
          <p className="text-xs text-text-dim">Targets are saved in this browser only. Leave all fields empty to turn targets off.</p>
        </div>
        <div className="flex items-center justify-between gap-2.5 px-6 py-4 bg-white/2 border-t border-white/8">
          <button type="button" className="btn btn-danger" onClick={() => { onSave(null); onClose(); }}>Clear targets</button>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </div>
      </form>
    </div>
  );
};
