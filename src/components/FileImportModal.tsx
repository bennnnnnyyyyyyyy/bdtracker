'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface FileImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Admins also get the one-click "Repair duplicates" fix when the check fails. */
  isAdmin?: boolean;
}

async function sheetCall(action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'The action failed');
  return json;
}

export const FileImportModal: React.FC<FileImportModalProps> = ({ isOpen, onClose, onSuccess, isAdmin }) => {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [lastFile, setLastFile] = useState<File | null>(null);   // kept so a failed check can be retried after a repair
  const [checkFailed, setCheckFailed] = useState(false);
  const [newAgents, setNewAgents] = useState<string[]>([]);
  const [openers, setOpeners] = useState<Record<string, string>>({});
  const [fixing, setFixing] = useState(false);
  const [clock, setClock] = useState<'local' | 'ultatel'>('local');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (/\.(csv|xlsx|xls)$/i.test(droppedFile.name)) {
        setFile(droppedFile);
        setStatusMessage(null);
        setDetails([]);
      } else {
        setStatusMessage({ type: 'error', text: 'Please upload an Ultatel export (.csv) or an Excel workbook (.xlsx or .xls).' });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatusMessage(null);
      setDetails([]);
    }
  };

  const uploadFile = async (target: File) => {
    setUploading(true);
    setStatusMessage(null);
    setCheckFailed(false);
    setNewAgents([]);
    setLastFile(target);

    try {
      // A big call export is imported in several requests (each stays under the server's time limit); the
      // server says where to continue, and the totals are added up here.
      let startChunk = 0;
      let json: Record<string, unknown> = {};
      const sum = { imported: 0, duplicates: 0, newAgents: [] as string[], checkOk: true, checkProblems: [] as string[] };
      for (let guard = 0; guard < 100; guard++) {
        const formData = new FormData();
        formData.append('file', target);
        formData.append('clock', clock);
        formData.append('startChunk', String(startChunk));
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const text = await res.text();
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(`The server stopped answering (${res.status}${text ? `: ${text.slice(0, 80)}` : ''}). Uploading the file again only adds what is missing.`);
        }
        if (!res.ok) throw new Error((json.error as string) || 'Upload failed');
        if (json.fileType !== 'ultatel_calls') break;
        sum.imported += (json.imported as number) ?? 0;
        sum.duplicates += (json.duplicates as number) ?? 0;
        ((json.newAgents as string[]) ?? []).forEach((a) => { if (!sum.newAgents.includes(a)) sum.newAgents.push(a); });
        if (json.checkOk === false) sum.checkOk = false;
        sum.checkProblems.push(...((json.checkProblems as string[]) ?? []));
        if (json.nextChunk === null || json.nextChunk === undefined) break;
        startChunk = json.nextChunk as number;
        setStatusMessage({ type: 'success', text: `Importing… ${startChunk} of ${json.chunks} parts done (${sum.imported} added so far).` });
      }
      if (json.fileType === 'ultatel_calls') {
        const parts = [`${sum.imported} new call(s) added`];
        if (sum.duplicates > 0) parts.push(`${sum.duplicates} already in the sheet`);
        json = { ...json, ...sum, message: `Call export imported: ${parts.join(', ')}.` };
      }

      setStatusMessage({
        type: json.checkOk === false ? 'error' : 'success',
        text: (json.message as string | undefined) || 'File uploaded successfully! Refreshing dashboard metrics...',
      });
      // Extra lines for a call export: the sheet's per-agent check and agents that still need an Opener name.
      const lines: string[] = [];
      if (json.fileType === 'ultatel_calls') {
        if (json.checkOk === false) {
          lines.push('Check failed: the sheet differs from the file for:');
          (json.checkProblems as string[]).forEach((problem) => lines.push(problem));
          lines.push('Extra rows are usually duplicates: run "Repair duplicate calls" in the sheet, then upload the file again. If the same rows are still listed, they are not in this file.');
        } else {
          lines.push('Check passed: every agent in the file matches the sheet.');
        }
        if ((json.newAgents as string[] | undefined)?.length) {
          lines.push(`New agent(s) added to Agent Mapping: ${(json.newAgents as string[]).join(', ')}. Enter their Opener name below.`);
        }
      }
      setDetails(lines);
      setCheckFailed(json.fileType === 'ultatel_calls' && json.checkOk === false);
      setNewAgents((json.newAgents as string[] | undefined) ?? []);
      setFile(null);

      // Trigger automatic dashboard refresh; stay open longer when there is something to read or do.
      setTimeout(() => {
        onSuccess();
        if (lines.length === 0) onClose();
      }, lines.length > 0 ? 400 : 1200);
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Upload failed',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = () => {
    if (file) void uploadFile(file);
  };

  // One click: repair duplicate rows in the sheet, then upload the same file again to re-check it.
  const repairAndRecheck = async () => {
    if (!lastFile) return;
    setFixing(true);
    try {
      await sheetCall('repair');
      await uploadFile(lastFile);
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Repair failed' });
    } finally {
      setFixing(false);
    }
  };

  const saveOpenerNames = async () => {
    setFixing(true);
    try {
      const entries = newAgents.map((agent) => ({ agent, opener: (openers[agent] ?? '').trim() || agent.split(' ')[0] }));
      await sheetCall('setMapping', { entries });
      setNewAgents([]);
      setDetails((prev) => [...prev, 'Opener names saved.']);
      onSuccess();
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not save the names' });
    } finally {
      setFixing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1a1608] border border-[rgba(201,168,76,0.3)]">
              <FileSpreadsheet className="w-4 h-4 text-[#e8c56a]" />
            </div>
            <div>
              <h2 id="modal-title" className="font-serif text-base font-bold text-white">Import Spreadsheet</h2>
              <p className="label-caps mt-0.5 text-slate-400">Ultatel Calls or Attendance Workbook</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Drag &amp; drop or select a file. The app recognizes what it is:
          </p>

          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="p-3 rounded-lg bg-white/3 border border-white/6 flex flex-col gap-1">
              <span className="font-semibold text-[#4ade80]">Ultatel Call Details (CSV or Excel)</span>
              <span className="text-[11px] text-slate-400">e.g. <code>Call Details - 10-12-2026.csv</code>. Added straight to the Call Logs sheet; calls already there are skipped, so uploading an overlapping file is safe.</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-white/3 border border-white/6 flex flex-col gap-1">
                <span className="font-semibold text-[#e8c56a]">Attendance Workbook</span>
                <span className="text-[11px] text-slate-400">local use only</span>
              </div>
              <div className="p-3 rounded-lg bg-white/3 border border-white/6 flex flex-col gap-1">
                <span className="font-semibold text-[#38bdf8]">Ultatel Outbound summary</span>
                <span className="text-[11px] text-slate-400">local use only</span>
              </div>
            </div>
          </div>

          {/* Drag & Drop Box */}
          <label className="flex items-center gap-2 text-xs text-slate-300 mb-2">
            Times in a call export are in
            <select
              value={clock}
              onChange={(e) => setClock(e.target.value === 'ultatel' ? 'ultatel' : 'local')}
              className="bg-transparent border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
            >
              <option value="local" className="text-black">our local time (new Ultatel setting)</option>
              <option value="ultatel" className="text-black">Ultatel&apos;s old UTC-6 clock</option>
            </select>
          </label>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all flex flex-col items-center justify-center gap-2 ${
              dragOver
                ? 'border-[#e8c56a] bg-[#1a1608]/50'
                : 'border-white/10 hover:border-white/20 bg-white/2'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,.xlsx,.xls"
              className="hidden"
            />
            <Upload className={`w-6 h-6 ${dragOver ? 'text-[#e8c56a]' : 'text-slate-500'}`} />
            <div className="text-xs font-medium text-slate-200">
              {file ? (
                <span className="text-[#e8c56a] font-semibold">{file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
              ) : (
                <span>Drop the file here or <span className="text-[#e8c56a] underline">browse</span></span>
              )}
            </div>
            <span className="text-[10px] text-slate-500 font-num">Supported: .csv, .xlsx, .xls</span>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl flex items-center gap-2.5 text-xs ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
          {details.length > 0 && (
            <ul className="space-y-1 text-[11px] text-slate-300 list-disc pl-5">
              {details.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
          {checkFailed && (
            isAdmin ? (
              <button onClick={repairAndRecheck} disabled={fixing || uploading} className="px-3 py-2 rounded-lg text-xs font-semibold border border-[rgba(201,168,76,0.35)] text-[#e8c56a] disabled:opacity-40 flex items-center gap-2">
                {(fixing || uploading) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Repair duplicates and check again
              </button>
            ) : (
              <p className="text-[11px] text-slate-400">Ask an admin to repair the duplicates (Actions &gt; Call log maintenance).</p>
            )
          )}
          {newAgents.length > 0 && (
            <div className="space-y-2 rounded-lg border border-white/10 p-3">
              <p className="text-[11px] text-slate-300">New agent(s) need the name the BD tracker uses for them:</p>
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
              <button onClick={saveOpenerNames} disabled={fixing} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white disabled:opacity-40">Save names</button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-white/2 border-t border-white/6">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-40 transition-all"
            style={{ background: '#1a1608', border: '1px solid rgba(201,168,76,0.35)', color: '#e8c56a' }}
          >
            {uploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Upload &amp; Sync</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
