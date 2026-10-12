'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import type { UserRole } from '@/types/dashboard';

interface UserRow {
  id: string; name: string; email: string; role: UserRole; active: boolean; lastLoginAt: string | null;
}

const ROLE_HELP: Record<UserRole, string> = {
  admin: 'Everything, including managing users',
  manager: 'Can confirm shows',
  viewer: 'View only',
};

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Request failed');
  return json;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'manager' as UserRole, password: '' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to load users');
      setUsers(json.users);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const run = async (action: () => Promise<unknown>, ok: string) => {
    try {
      await action();
      setNotice(ok);
      setError(null);
      await load();
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  const resetPassword = (u: UserRow) => {
    const password = window.prompt(`New temporary password for ${u.name} (min 10 characters). They must change it at next sign-in.`);
    if (password) run(() => api(`/api/admin/users/${u.id}`, 'PATCH', { password }), `Password reset for ${u.name}.`);
  };

  const input = 'rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-[#e8c56a]';
  return (
    <main className="min-h-screen px-4 py-8" style={{ background: '#09090b', color: '#f4f4f5' }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Users</h1>
          <Link href="/" className="text-sm text-[#a1a1aa] underline">Back to dashboard</Link>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="rounded-lg border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-300">{notice}</p>}

        <form
          onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/api/admin/users', 'POST', form); setForm({ name: '', email: '', role: 'manager', password: '' }); }, 'User created. They must change the temporary password at first sign-in.'); }}
          className="rounded-xl border border-white/10 bg-white/5 p-4 grid gap-3 sm:grid-cols-2"
        >
          <h2 className="sm:col-span-2 font-semibold text-sm">Add a user</h2>
          <input aria-label="Name" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
          <input aria-label="Email" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
          <select aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className={input}>
            {(Object.keys(ROLE_HELP) as UserRole[]).map((r) => <option key={r} value={r}>{r} — {ROLE_HELP[r]}</option>)}
          </select>
          <input aria-label="Temporary password" type="text" placeholder="Temporary password (min 10 characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={input} />
          <button type="submit" className="sm:col-span-2 rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: '#e8c56a', color: '#09090b' }}>Create user</button>
        </form>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="text-left text-[#a1a1aa]"><tr><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Last sign-in</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-white/10">
                  <td className="p-3"><div className="font-medium">{u.name}</div><div className="text-xs text-[#a1a1aa]">{u.email}</div></td>
                  <td className="p-3">
                    <select aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => run(() => api(`/api/admin/users/${u.id}`, 'PATCH', { role: e.target.value }), `Role updated for ${u.name}.`)} className={input}>
                      {(Object.keys(ROLE_HELP) as UserRole[]).map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-[#a1a1aa]">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                  <td className="p-3">{u.active ? 'Active' : 'Disabled'}</td>
                  <td className="p-3 text-right space-x-3 whitespace-nowrap">
                    <button onClick={() => resetPassword(u)} className="text-[#e8c56a] underline">Reset password</button>
                    <button onClick={() => run(() => api(`/api/admin/users/${u.id}`, 'PATCH', { active: !u.active }), `${u.name} ${u.active ? 'disabled' : 'enabled'}.`)} className="text-[#a1a1aa] underline">{u.active ? 'Disable' : 'Enable'}</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !error && <tr><td className="p-4 text-[#a1a1aa]" colSpan={5}>No users yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
