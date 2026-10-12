'use client';

import React, { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || 'Sign-in failed.');
        return;
      }
      const next = new URLSearchParams(window.location.search).get('next');
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      // Full page load so the new session cookie is used everywhere.
      window.location.href = body?.mustChangePassword ? '/account?force=1' : safeNext;
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center px-4" style={{ background: '#09090b', color: '#f4f4f5' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-lg font-semibold">BD Manager Dashboard</h1>
        <p className="text-sm text-[#a1a1aa]">Sign in with your own account.</p>
        <div className="space-y-1">
          <label className="block text-sm text-[#a1a1aa]" htmlFor="email">Email</label>
          <input id="email" type="email" autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-[#e8c56a]" />
        </div>
        <div className="space-y-1">
          <label className="block text-sm text-[#a1a1aa]" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-[#e8c56a]" />
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={submitting || !email || !password}
          className="w-full rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: '#e8c56a', color: '#09090b' }}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
