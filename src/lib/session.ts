// Signed session cookie. Web Crypto only, so it works in the proxy and in route handlers.
import type { UserRole, ViewerInfo } from '../types/dashboard';

export const SESSION_COOKIE = 'bd_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface SessionPayload extends ViewerInfo {
  exp: number; // seconds since epoch
}

export function getAuthSecret(): string {
  return process.env.AUTH_SECRET || '';
}

/** Local development without AUTH_SECRET runs signed in as a built-in admin. Never in production. */
export function isDevAuthBypass(): boolean {
  return !getAuthSecret() && process.env.NODE_ENV !== 'production';
}

export const DEV_VIEWER: ViewerInfo = { id: 'dev', name: 'Local development', email: 'dev@localhost', role: 'admin' };

const enc = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(message: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createSessionValue(user: ViewerInfo, now = Date.now()): Promise<string> {
  const payload: SessionPayload = { ...user, exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS };
  const body = toB64Url(enc.encode(JSON.stringify(payload)));
  const sig = toB64Url(await hmac(body, getAuthSecret()));
  return `${body}.${sig}`;
}

export async function readSessionValue(value: string | undefined, now = Date.now()): Promise<SessionPayload | null> {
  const secret = getAuthSecret();
  if (!value || !secret) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  try {
    const expected = await hmac(body, secret);
    if (!equalBytes(expected, fromB64Url(sig))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64Url(body))) as SessionPayload;
    if (!payload?.id || !payload.role || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function canConfirm(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager';
}
