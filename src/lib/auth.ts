// Shared-password auth for the dashboard. Uses Web Crypto only so it runs in the proxy and in route handlers.

export const SESSION_COOKIE = 'bd_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function getDashboardPassword(): string {
  return process.env.DASHBOARD_PASSWORD || '';
}

/** Auth is optional outside production so local development keeps working without setup. */
export function isAuthDisabled(): boolean {
  return !getDashboardPassword() && process.env.NODE_ENV !== 'production';
}

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Session token derived from the password; changing the password signs everyone out. */
export async function createSessionToken(): Promise<string> {
  return hmacHex(getDashboardPassword(), 'bd-tracker-session-v1');
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !getDashboardPassword()) return false;
  return timingSafeEqual(token, await createSessionToken());
}

export async function isCorrectPassword(input: string): Promise<boolean> {
  const password = getDashboardPassword();
  if (!password) return false;
  // Compare digests so length differences do not leak.
  const [a, b] = await Promise.all([hmacHex('bd-tracker-login', input), hmacHex('bd-tracker-login', password)]);
  return timingSafeEqual(a, b);
}
