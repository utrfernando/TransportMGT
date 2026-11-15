import { supabase } from './supabase';

export interface AccountStatus { id: string; email: string; last_sign_in_at: string | null; confirmed: boolean; banned: boolean; must_change_password: boolean }
export interface CreateResult { user_id: string; email: string; created: boolean; mode: 'password' | 'invite' | 'existing'; linked: { students: number; customers: number } }

/** Calls the admin-only server API (it holds the Supabase secret key, the browser never does). */
export async function callPortalApi<T>(payload: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  let res: Response;
  try {
    res = await fetch('/api/portal-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  } catch { throw new Error('Could not reach the server. Check your connection and try again.'); }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
  if (!res.ok) {
    if (res.status === 404 || (!json.error && res.status >= 500)) throw new Error('The account service is not available. On Vercel, add SUPABASE_SECRET_KEY to the project’s environment variables (see README) and redeploy.');
    throw new Error(typeof json.error === 'string' ? json.error : 'Something went wrong.');
  }
  return json as T;
}

/** A readable but strong password the admin can hand to a family (the family is made to change it at first sign-in). */
export function generatePassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = (n: number, set: string) => Array.from(crypto.getRandomValues(new Uint32Array(n)), v => set[v % set.length]).join('');
  return `${pick(4, letters)}-${pick(4, letters)}-${pick(4, letters)}-${pick(2, '23456789')}`;
}
