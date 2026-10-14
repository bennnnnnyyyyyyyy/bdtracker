'use client';

import React, { useRef, useState } from 'react';
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface FileImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

async function sheetCall(action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'The action failed');
  return json;
}

const ACCEPTED = /\.(csv|xlsx|xls)$/i;

export const FileImportModal: React.FC<FileImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [newAgents, setNewAgents] = useState<string[]>([]);
  const [openers, setOpeners] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const selectFiles = (picked: File[]) => {
    const ok = picked.filter((f) => ACCEPTED.test(f.name));
    if (ok.length === 0) {
      setStatus({ type: 'error', text: 'Please choose a .csv or Excel file.' });
      return;
    }
    setFiles(ok);
    setFrom('');
    setTo('');
    setStatus(null);
    setDetails([]);
  };

  // Each file is uploaded in turn. Dates typed above apply to a single file; otherwise they come from the file.
  const upload = async () => {
    setUploading(true);
    setStatus(null);
    setNewAgents([]);
    const lines: string[] = [];
    const agents: string[] = [];
    let saved = 0;
    for (let i = 0; i < files.length; i++) {
      setStatus({ type: 'success', text: files.length > 1 ? `Uploading ${i + 1} of ${files.length}: ${files[i].name}…` : 'Uploading…' });
      try {
        const formData = new FormData();
        formData.append('file', files[i]);
        if (files.length === 1 && from) formData.append('date', from);
        if (files.length === 1 && to) formData.append('endDate', to);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const text = await res.text();
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(text); } catch { throw new Error(`The server did not answer properly (${res.status}). Try again.`); }
        if (!res.ok) throw new Error((body.error as string) || 'Upload failed');
        saved++;
        ((body.newAgents as string[]) ?? []).forEach((a) => { if (!agents.includes(a)) agents.push(a); });
        lines.push(files.length > 1 ? `${files[i].name}: ${body.message as string}` : (body.message as string));
      } catch (err) {
        lines.push(`${files[i].name}: not saved (${err instanceof Error ? err.message : 'failed'})`);
      }
    }
    setStatus({ type: saved === files.length ? 'success' : 'error', text: `${saved} of ${files.length} file(s) saved.` });
    setDetails(lines);
    setNewAgents(agents);
    setFiles([]);
    setUploading(false);
    if (saved > 0) onSuccess();
  };

  const saveOpenerNames = async () => {
    setSaving(true);
    try {
      const entries = newAgents.map((agent) => ({ agent, opener: (openers[agent] ?? '').trim() || agent.split(' ')[0] }));
      await sheetCall('setMapping', { entries });
      setNewAgents([]);
      setDetails((prev) => [...prev, 'Opener names saved.']);
      onSuccess();
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : 'Could not save the names' });
    } finally {
      setSaving(false);
    }
  };

  const dateInput = 'bg-transparent border border-white/10 rounded-lg px-2 py-1 text-xs text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="w-full max-w-lg max-h-[92vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg" style={{ background: 'rgba(201,168,76,0.12)' }}>
              <FileSpreadsheet className="w-4 h-4 text-[#e8c56a]" />
            </div>
            <div>
              <h2 id="modal-title" className="font-serif text-base font-bold text-white">Upload Ultatel report</h2>
              <p className="label-caps mt-0.5 text-slate-400">Total Calls Per Extension (CSV or Excel)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer" aria-label="Close modal">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto min-h-0">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); selectFiles(Array.from(e.dataTransfer.files)); }}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all flex flex-col items-center justify-center gap-2 ${
              dragOver ? 'border-[#e8c56a] bg-[#1a1608]/50' : 'border-white/10 hover:border-white/20 bg-white/2'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => { if (e.target.files) selectFiles(Array.from(e.target.files)); }}
              accept=".csv,.xlsx,.xls"
              multiple
              className="hidden"
            />
            <Upload className={`w-6 h-6 ${dragOver ? 'text-[#e8c56a]' : 'text-slate-500'}`} />
            <div className="text-xs font-medium text-slate-200">
              {files.length > 1 ? (
                <span className="text-[#e8c56a] font-semibold">{files.length} files selected</span>
              ) : files.length === 1 ? (
                <span className="text-[#e8c56a] font-semibold">{files[0].name} ({(files[0].size / 1024).toFixed(0)} KB)</span>
              ) : (
                <span>Drop the file(s) here or <span className="text-[#e8c56a] underline">browse</span></span>
              )}
            </div>
          </div>

          {files.length === 1 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              Dates (optional, if the file has none)
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateInput} aria-label="From date" />
              to
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateInput} aria-label="To date" />
            </div>
          )}

          {status && (
            <div className={`p-3 rounded-xl flex items-center gap-2.5 text-xs ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
              {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{status.text}</span>
            </div>
          )}
          {details.length > 0 && (
            <ul className="space-y-1 text-[11px] text-slate-300 list-disc pl-5 max-h-48 overflow-y-auto break-words">
              {details.slice(0, 12).map((line, i) => <li key={i}>{line.length > 400 ? `${line.slice(0, 400)}…` : line}</li>)}
              {details.length > 12 && <li>…and {details.length - 12} more.</li>}
            </ul>
          )}
          {newAgents.length > 0 && (
            <div className="space-y-2 rounded-lg border border-white/10 p-3">
              <p className="text-[11px] text-slate-300">New agent(s): type the name the BD tracker uses, or “ignore” for anyone not on the BD team.</p>
              {newAgents.map((agent) => (
                <label key={agent} className="flex items-center gap-2 text-[11px]">
                  <span className="w-40 shrink-0 truncate text-slate-300">{agent}</span>
                  <input
                    value={openers[agent] ?? ''}
                    onChange={(e) => setOpeners({ ...openers, [agent]: e.target.value })}
                    placeholder={agent.split(' ')[0]}
                    className="flex-1 rounded-lg bg-black/40 border border-white/10 px-2 py-1 text-xs focus:outline-none focus:border-[#e8c56a]"
                  />
                </label>
              ))}
              <button onClick={saveOpenerNames} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white disabled:opacity-40">Save names</button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-white/2 border-t border-white/6">
          <button onClick={onClose} disabled={uploading} className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
            Close
          </button>
          <button
            onClick={() => void upload()}
            disabled={files.length === 0 || uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-40 transition-all"
            style={{ background: '#1a1608', border: '1px solid rgba(201,168,76,0.35)', color: '#e8c56a' }}
          >
            {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Uploading…</span></> : <><Upload className="w-3.5 h-3.5" /><span>Upload</span></>}
          </button>
        </div>
      </div>
    </div>
  );
};
