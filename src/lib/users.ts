import { getSupabaseService } from './supabase';
import type { UserRole, ViewerInfo } from '../types/dashboard';

export interface AppUser extends ViewerInfo {
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AppUserWithHash extends AppUser {
  passwordHash: string;
}

type UserRow = {
  id: string; email: string; name: string; role: UserRole; password_hash: string; active: boolean;
  must_change_password: boolean; created_at: string; last_login_at: string | null;
};

const COLUMNS = 'id, email, name, role, password_hash, active, must_change_password, created_at, last_login_at';

function toUser(row: UserRow): AppUserWithHash {
  return {
    id: row.id, email: row.email, name: row.name, role: row.role, active: row.active,
    mustChangePassword: row.must_change_password, createdAt: row.created_at, lastLoginAt: row.last_login_at,
    passwordHash: row.password_hash,
  };
}

export function publicUser(user: AppUserWithHash): AppUser {
  const rest: Partial<AppUserWithHash> = { ...user };
  delete rest.passwordHash;
  return rest as AppUser;
}

function db() {
  const client = getSupabaseService();
  if (!client) throw new Error('User accounts need SUPABASE_SERVICE_ROLE_KEY to be configured.');
  return client;
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<AppUserWithHash | null> {
  const { data, error } = await db().from('app_users').select(COLUMNS).eq('email', normalizeEmail(email)).maybeSingle();
  if (error) throw new Error(`User lookup failed: ${error.message}`);
  return data ? toUser(data as UserRow) : null;
}

export async function findUserById(id: string): Promise<AppUserWithHash | null> {
  const { data, error } = await db().from('app_users').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`User lookup failed: ${error.message}`);
  return data ? toUser(data as UserRow) : null;
}

export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await db().from('app_users').select(COLUMNS).order('created_at');
  if (error) throw new Error(`User list failed: ${error.message}`);
  return (data as UserRow[]).map((row) => publicUser(toUser(row)));
}

export async function createUser(input: {
  email: string; name: string; role: UserRole; passwordHash: string; mustChangePassword?: boolean;
}): Promise<AppUser> {
  const { data, error } = await db().from('app_users').insert({
    email: normalizeEmail(input.email), name: input.name.trim(), role: input.role,
    password_hash: input.passwordHash, must_change_password: input.mustChangePassword ?? true,
  }).select(COLUMNS).single();
  if (error) throw new Error(error.code === '23505' ? 'A user with that email already exists.' : `Create user failed: ${error.message}`);
  return publicUser(toUser(data as UserRow));
}

export async function updateUser(id: string, patch: Partial<{
  name: string; role: UserRole; active: boolean; passwordHash: string; mustChangePassword: boolean; lastLoginAt: string;
}>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.passwordHash !== undefined) row.password_hash = patch.passwordHash;
  if (patch.mustChangePassword !== undefined) row.must_change_password = patch.mustChangePassword;
  if (patch.lastLoginAt !== undefined) row.last_login_at = patch.lastLoginAt;
  const { error } = await db().from('app_users').update(row).eq('id', id);
  if (error) throw new Error(`Update user failed: ${error.message}`);
}

export async function countActiveAdmins(): Promise<number> {
  const { count, error } = await db().from('app_users').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true);
  if (error) throw new Error(`Admin count failed: ${error.message}`);
  return count ?? 0;
}
