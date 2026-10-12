'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';

export default function AccountPage() {
  const [forced, setForced] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setForced(new URLSearchParams(window.location.search).get('force') === '1'), 0);
    return () => window.clearTimeout(t);
  }, []);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirm) {
      setMessage({ ok: false, text: 'The new passwords do not match.' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ ok: false, text: body?.error || 'Could not change the password.' });
        return;
      }
      setMessage({ ok: true, text: 'Password changed.' });
      setCurrentPassword(''); setNewPassword(''); setConfirm('');
    } finally {
      setSubmitting(false);
    }
  };

  const field = 'w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-[#e8c56a]';
  return (
    <main className="min-h-screen w-full flex items-center justify-center px-4" style={{ background: '#09090b', color: '#f4f4f5' }}>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-lg font-semibold">Change password</h1>
        {forced && <p className="text-sm text-[#e8c56a]">Your password was set by an admin. Please choose your own before continuing.</p>}
        <input aria-label="Current password" type="password" placeholder="Current password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={field} />
        <input aria-label="New password" type="password" placeholder="New password (min 10 characters)" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={field} />
        <input aria-label="Repeat new password" type="password" placeholder="Repeat new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
        {message && <p role="status" className={`text-sm ${message.ok ? 'text-green-400' : 'text-red-400'}`}>{message.text}</p>}
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-[#a1a1aa] underline">Back to dashboard</Link>
          <button type="submit" disabled={submitting || !currentPassword || !newPassword}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: '#e8c56a', color: '#09090b' }}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </main>
  );
}
