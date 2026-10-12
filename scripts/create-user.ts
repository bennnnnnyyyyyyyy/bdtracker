/**
 * Creates (or resets) a dashboard user straight in Supabase. Use it once to create the first admin;
 * after that admins manage users from the dashboard (Users page).
 *
 *   npm run create-user -- --email you@company.com --name "Your Name" --role admin
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL from .env.local. The password is
 * asked for on the command line (or pass --password).
 */
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import { hashPassword, validateNewPassword } from '../src/lib/password';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tyideivywfxxvqbfdxag.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set (put it in .env.local).');

  const email = (arg('email') || (await ask('Email: '))).trim().toLowerCase();
  const name = (arg('name') || (await ask('Name: '))).trim();
  const role = arg('role') || 'admin';
  if (!['admin', 'manager', 'viewer'].includes(role)) throw new Error('Role must be admin, manager or viewer.');
  const password = arg('password') || (await ask('Password (min 10 characters; visible as you type): '));
  const problem = validateNewPassword(password);
  if (problem) throw new Error(problem);

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await db.from('app_users').upsert(
    { email, name, role, password_hash: await hashPassword(password), active: true, must_change_password: false },
    { onConflict: 'email' }
  );
  if (error) throw new Error(error.message);
  console.log(`Saved ${role} account for ${email}. You can sign in now.`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
