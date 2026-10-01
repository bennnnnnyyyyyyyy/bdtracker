import { createBrowserClient } from '@supabase/ssr';

export const ADMIN_EMAILS = [
  'ben.arthur.wiz@gmail.com',
  'mike.woods.wiz@gmail.com',
];

export type UserProfile = {
  id: string;
  email: string;
  opener_name: string | null;
  role: 'admin' | 'agent' | string;
  display_name: string | null;
};

export type Viewer = {
  email: string;
  displayName: string;
  avatarUrl: string;
  role: 'admin' | 'agent';
  openerName: string | null;
  isAdmin: boolean;
};

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && ADMIN_EMAILS.includes(email.trim().toLowerCase()));
}

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
