'use client';

import { FormEvent, useState } from 'react';
import { Pencil, Plus, Trash2, Users, X } from 'lucide-react';

type UserRow = {
  id: string;
  email: string;
  opener_name: string | null;
  display_name: string | null;
  role: 'admin' | 'agent';
};

type AdminUsersPanelProps = {
  openers: string[];
};

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string; users?: UserRow[] };
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}

export function AdminUsersPanel({ openers }: AdminUsersPanelProps) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [openerName, setOpenerName] = useState('');
  const [role, setRole] = useState<'agent' | 'admin'>('agent');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const resetForm = () => {
    setEmail('');
    setDisplayName('');
    setOpenerName('');
    setRole('agent');
  };

  const loadUsers = async () => {
    const response = await fetch('/api/admin/users', { cache: 'no-store' });
    const body = await readResponse(response);
    setUsers(body.users || []);
  };

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setMessage('Loading user mappings…');
    try {
      await loadUsers();
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load user mappings.');
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('Saving user…');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, display_name: displayName, opener_name: openerName, role }),
      });
      await readResponse(response);
      resetForm();
      await loadUsers();
      setMessage('User mapping saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save the user mapping.');
    } finally {
      setBusy(false);
    }
  };

  const edit = (user: UserRow) => {
    setEmail(user.email);
    setDisplayName(user.display_name || '');
    setOpenerName(user.opener_name || '');
    setRole(user.role);
    setMessage(`Editing ${user.email}. Saving will update this mapping.`);
  };

  const remove = async (user: UserRow) => {
    if (busy || !window.confirm(`Remove the mapping for ${user.email}?`)) return;
    setBusy(true);
    setMessage('Removing user mapping…');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      await readResponse(response);
      if (email === user.email) resetForm();
      await loadUsers();
      setMessage('User mapping removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to remove the user mapping.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={toggle} className="min-h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-white/10 text-text-primary"><Users className="w-3.5 h-3.5" />Users</button>
      {open && <div className="fixed inset-0 z-50 bg-black/60" onClick={toggle}>
        <aside role="dialog" aria-modal="true" aria-labelledby="user-mappings-title" className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-6 flex items-center justify-between"><div><div className="sec-tag">Admin</div><h2 id="user-mappings-title" className="font-serif text-xl font-bold text-white">User mappings</h2></div><button onClick={toggle} aria-label="Close user mappings" className="min-h-11 min-w-11"><X className="h-5 w-5 text-text-dim" /></button></div>
          <form onSubmit={save} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div><label htmlFor="mapping-email" className="mb-1 block text-xs text-text-dim">Google email</label><input id="mapping-email" required maxLength={254} type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white" /></div>
            <div><label htmlFor="mapping-display-name" className="mb-1 block text-xs text-text-dim">Display name <span className="text-text-faint">(optional)</span></label><input id="mapping-display-name" maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="min-h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white" /></div>
            <div><label htmlFor="mapping-opener" className="mb-1 block text-xs text-text-dim">Opener name {role === 'agent' && <span aria-hidden="true">*</span>}</label><select id="mapping-opener" required={role === 'agent'} value={openerName} onChange={(event) => setOpenerName(event.target.value)} className="min-h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white"><option value="">{openers.length ? 'Select an opener' : 'No openers available'}</option>{openers.map((opener) => <option key={opener} value={opener}>{opener}</option>)}</select></div>
            <div className="flex gap-2"><div className="min-w-0 flex-1"><label htmlFor="mapping-role" className="mb-1 block text-xs text-text-dim">Role</label><select id="mapping-role" value={role} onChange={(event) => setRole(event.target.value as 'agent' | 'admin')} className="min-h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white"><option value="agent">Agent</option><option value="admin">Admin</option></select></div><button type="submit" disabled={busy || (role === 'agent' && !openers.length)} className="mt-5 flex min-h-11 items-center gap-1 rounded-lg bg-gold-dim px-3 text-xs font-semibold text-gold-light disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Save</button></div>
            <div aria-live="polite" className="min-h-5 text-xs text-text-dim">{message}</div>
          </form>
          <div className="mt-5 space-y-2">{users.length === 0 && !message && <p className="rounded-lg border border-white/7 px-3 py-4 text-sm text-text-dim">No user mappings have been added yet.</p>}{users.map((user) => <div key={user.id} className="flex items-center gap-3 rounded-lg border border-white/7 px-3 py-2"><div className="min-w-0 flex-1"><div className="truncate text-sm text-white">{user.display_name || user.email}</div><div className="truncate text-xs text-text-dim">{user.email} · {user.role}{user.opener_name ? ` · ${user.opener_name}` : ''}</div></div><button onClick={() => edit(user)} disabled={busy} aria-label={`Edit ${user.email}`} className="min-h-11 min-w-11 text-text-dim hover:text-white disabled:opacity-50"><Pencil className="mx-auto h-4 w-4" /></button><button onClick={() => remove(user)} disabled={busy} aria-label={`Remove ${user.email}`} className="min-h-11 min-w-11 text-danger hover:text-white disabled:opacity-50"><Trash2 className="mx-auto h-4 w-4" /></button></div>)}</div>
        </aside>
      </div>}
    </>
  );
}
