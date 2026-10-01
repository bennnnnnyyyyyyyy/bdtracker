'use client';

import { FormEvent, useState } from 'react';
import { Plus, Users, X } from 'lucide-react';

type UserRow = { id: string; email: string; opener_name: string | null; display_name: string | null; role: string };

export function AdminUsersPanel() {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [openerName, setOpenerName] = useState('');
  const [role, setRole] = useState('agent');
  const [message, setMessage] = useState('');

  const loadUsers = async () => {
    const response = await fetch('/api/admin/users', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Failed to load users');
    setUsers(body.users || []);
  };

  const toggle = async () => {
    setOpen((value) => !value);
    if (!open) {
      try { await loadUsers(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Failed to load users'); }
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('Saving…');
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, display_name: displayName, opener_name: openerName, role }),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || 'Failed to save user'); return; }
    setEmail(''); setDisplayName(''); setOpenerName(''); setMessage('User saved.');
    await loadUsers();
  };

  return (
    <>
      <button onClick={toggle} className="min-h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-white/10 text-text-primary"><Users className="w-3.5 h-3.5" />Users</button>
      {open && <div className="fixed inset-0 z-50 bg-black/60" onClick={toggle}>
        <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-6 flex items-center justify-between"><div><div className="sec-tag">Admin</div><h2 className="font-serif text-xl font-bold text-white">User mappings</h2></div><button onClick={toggle} aria-label="Close user mappings"><X className="h-5 w-5 text-text-dim" /></button></div>
          <form onSubmit={save} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Google email" className="min-h-9 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white" />
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" className="min-h-9 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white" />
            <input value={openerName} onChange={(event) => setOpenerName(event.target.value)} placeholder="Opener name (required for agent)" className="min-h-9 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white" />
            <div className="flex gap-2"><select value={role} onChange={(event) => setRole(event.target.value)} className="min-h-9 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white"><option value="agent">Agent</option><option value="admin">Admin</option></select><button type="submit" className="flex min-h-9 items-center gap-1 rounded-lg bg-gold-dim px-3 text-xs font-semibold text-gold-light"><Plus className="h-3.5 w-3.5" />Save</button></div>
            {message && <p className="text-xs text-text-dim">{message}</p>}
          </form>
          <div className="mt-5 space-y-2">{users.map((user) => <div key={user.id} className="rounded-lg border border-white/7 px-3 py-2"><div className="text-sm text-white">{user.display_name || user.email}</div><div className="text-xs text-text-dim">{user.email} · {user.role}{user.opener_name ? ` · ${user.opener_name}` : ''}</div></div>)}</div>
        </aside>
      </div>}
    </>
  );
}
