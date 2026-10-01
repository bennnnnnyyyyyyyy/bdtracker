'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/auth';
import { LogIn, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    setLoading(true);
    setError('');
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6" style={{ background: '#09090b', color: '#f4f4f5' }}>
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-border bg-gold-dim text-gold">BD</div>
          <h1 className="font-serif text-2xl font-bold text-white">BD Manager Dashboard</h1>
          <p className="mt-2 text-sm text-text-dim">Sign in with your approved Google account.</p>
        </div>
        <button onClick={signIn} disabled={loading} className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
          <LogIn className="h-4 w-4" />
          {loading ? 'Redirecting…' : 'Sign in with Google'}
        </button>
        {error && <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      </section>
    </main>
  );
}
