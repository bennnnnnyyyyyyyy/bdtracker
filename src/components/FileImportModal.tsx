'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !uploading) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, uploading, onClose]);

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
      if (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls')) {
        setFile(droppedFile);
        setStatusMessage(null);
      } else {
        setStatusMessage({ type: 'error', text: 'Please upload an Excel workbook (.xlsx or .xls).' });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatusMessage(null);
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
        type: 'success',
        text: json.message || 'File uploaded successfully! Refreshing dashboard metrics...',
      });
      setFile(null);

      // Trigger automatic dashboard refresh
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
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
      onMouseDown={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col bg-surface border border-white/12"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gold-dim border border-gold-border">
              <FileSpreadsheet className="w-4 h-4 text-gold-light" />
            </div>
            <div>
              <h2 id="modal-title" className="font-serif text-lg font-bold text-white">Import spreadsheet</h2>
              <p className="text-xs text-text-dim mt-0.5">Ultatel calls or attendance workbook</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-icon border-transparent bg-transparent text-text-dim hover:text-white"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-text-muted leading-relaxed">
            Drag and drop or select an Excel file to update the dashboard data. The file type is detected automatically:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-lg bg-white/3 border border-white/6 flex flex-col gap-1">
              <span className="font-semibold text-gold-light">1. Attendance Workbook</span>
              <span className="text-xs text-text-dim">e.g. <code>BD _ French Dashboard 2026.xlsx</code></span>
            </div>
            <div className="p-3 rounded-lg bg-white/3 border border-white/6 flex flex-col gap-1">
              <span className="font-semibold text-white">2. Ultatel Outbound</span>
              <span className="text-xs text-text-dim">e.g. <code>OutBound Calls Per Department.xlsx</code></span>
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
                ? 'border-gold bg-gold-dim'
                : 'border-white/15 hover:border-white/30 bg-white/2'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <Upload className={`w-6 h-6 ${dragOver ? 'text-gold-light' : 'text-text-dim'}`} />
            <div className="text-sm font-medium text-text-primary">
              {file ? (
                <span className="text-gold-light font-semibold">{file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
              ) : (
                <span>Drop Excel file here or <span className="text-gold-light underline">browse</span></span>
              )}
            </div>
            <span className="text-xs text-text-dim font-num">Supported: .xlsx, .xls</span>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div
              role={statusMessage.type === 'error' ? 'alert' : 'status'}
              className={`p-3 rounded-xl flex items-center gap-2.5 text-sm ${
                statusMessage.type === 'success'
                  ? 'bg-success-dim text-success border border-success-border'
                  : 'bg-danger-dim text-danger border border-danger-border'
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
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-white/2 border-t border-white/8">
          <button
            onClick={onClose}
            disabled={uploading}
            className="btn"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="btn btn-primary"
          >
            {uploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading...</span>
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
