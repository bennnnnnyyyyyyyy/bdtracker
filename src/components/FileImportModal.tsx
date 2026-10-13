'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface FileImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const FileImportModal: React.FC<FileImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [details, setDetails] = useState<string[]>([]);
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

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Upload failed');
      }

      setStatusMessage({
        type: json.checkOk === false ? 'error' : 'success',
        text: json.message || 'File uploaded successfully! Refreshing dashboard metrics...',
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
          lines.push(`New agent(s) added to Agent Mapping: ${(json.newAgents as string[]).join(', ')}. Fill in their Opener name in the sheet.`);
        }
      }
      setDetails(lines);
      setFile(null);

      // Trigger automatic dashboard refresh; stay open longer when there is something to read.
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
