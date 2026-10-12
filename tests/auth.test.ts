import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, validateNewPassword, verifyPassword } from '../src/lib/password';
import { createSessionValue, readSessionValue } from '../src/lib/session';

describe('passwords', () => {
  it('hashes with a random salt and verifies', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
    expect(await verifyPassword('wrong password!!', a)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('enforces a minimum length', () => {
    expect(validateNewPassword('short')).toMatch(/at least/);
    expect(validateNewPassword('long enough password')).toBeNull();
  });
});

describe('sessions', () => {
  const user = { id: 'u1', name: 'Boss', email: 'boss@example.com', role: 'manager' as const };

  beforeEach(() => { process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret'; });

  it('round-trips a signed session', async () => {
    const value = await createSessionValue(user);
    expect(await readSessionValue(value)).toMatchObject(user);
  });

  it('rejects tampering, a wrong secret and expiry', async () => {
    const value = await createSessionValue(user);
    const [body, sig] = value.split('.');
    const forged = Buffer.from(JSON.stringify({ ...user, role: 'admin', exp: 9999999999 })).toString('base64url');
    expect(await readSessionValue(`${forged}.${sig}`)).toBeNull();
    expect(await readSessionValue(`${body}.AAAA`)).toBeNull();
    expect(await readSessionValue(undefined)).toBeNull();
    process.env.AUTH_SECRET = 'another-secret-another-secret-123456';
    expect(await readSessionValue(value)).toBeNull();
    process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret';
    expect(await readSessionValue(value, Date.now() + 8 * 24 * 3600 * 1000)).toBeNull();
  });
});

// ---- confirmation store, against an in-memory fake of the Supabase client ----
const tables: Record<string, Record<string, unknown>[]> = {};
vi.mock('../src/lib/supabase', () => {
  const builder = (table: string) => {
    const rows = () => (tables[table] ||= []);
    return {
      upsert: async (input: Record<string, unknown>[]) => {
        input.forEach((r) => {
          const i = rows().findIndex((x) => x.meeting_key === r.meeting_key);
          if (i >= 0) rows()[i] = r; else rows().push(r);
        });
        return { error: null };
      },
      insert: async (input: Record<string, unknown>[]) => { rows().push(...input); return { error: null }; },
      delete: () => ({ in: async (_c: string, keys: string[]) => { tables[table] = rows().filter((r) => !keys.includes(r.meeting_key as string)); return { error: null }; } }),
      select: () => ({ order: () => ({ range: async () => ({ data: rows(), error: null }) }) }),
    };
  };
  return { getSupabaseService: () => ({ from: builder }) };
});

describe('confirmation store', () => {
  it('confirms, audits, loads and revokes', async () => {
    const { applyConfirmations, loadConfirmations, initialImportCandidates } = await import('../src/lib/confirmations');
    const { annotateMeetings } = await import('../src/lib/meetings');
    const meetings = annotateMeetings([
      { stage: 'Follow Ups', opener: 'Ben', dateAdded: '2026-08-10', companyName: 'Acme' },
      { stage: 'New Meetings', opener: 'Ben', dateAdded: '2026-08-11', companyName: 'Zed' },
    ], new Map());
    const boss = { id: 'u1', name: 'Boss', email: 'boss@example.com', role: 'manager' as const };

    expect(initialImportCandidates(meetings)).toHaveLength(1); // only the show-stage meeting
    expect(await applyConfirmations('confirm', [meetings[0]], boss)).toBe(1);

    const loaded = await loadConfirmations();
    expect(loaded?.get(meetings[0].meetingKey as string)?.confirmedBy).toBe('Boss');
    expect(tables['show_confirmation_events']).toHaveLength(1);
    expect(tables['show_confirmation_events'][0]).toMatchObject({ action: 'confirm', user_email: 'boss@example.com' });

    await applyConfirmations('revoke', [meetings[0]], boss);
    expect((await loadConfirmations())?.size).toBe(0);
    expect(tables['show_confirmation_events']).toHaveLength(2);
  });
});
