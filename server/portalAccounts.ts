/**
 * Admin-only API that creates and manages the online accounts of students' families and hire customers.
 *
 * It is the ONLY place that uses the Supabase secret key (needed to create auth users), so it runs on the server
 * (a Vercel function in production, Vite's dev server locally) and never in the browser. Every request must carry a
 * signed-in ADMIN's access token; staff accounts can never be touched through these endpoints.
 */
import { z } from 'zod';

export interface ApiEnv { url: string; anonKey: string; secretKey: string; siteUrl?: string }
export interface ApiRequest { method: string; authorization?: string; origin?: string; body: unknown }
export interface ApiResponse { status: number; body: Record<string, unknown> }
type Fetch = typeof fetch;

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(200);
const password = z.string().min(10, 'The password must be at least 10 characters').max(72, 'The password is too long');
const ids = z.array(z.string().uuid()).max(20).default([]);
const person = { full_name: z.string().trim().min(2, 'Enter the name').max(120), phone: z.string().trim().max(30).optional() };

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), email, ...person, student_ids: ids, customer_ids: ids, mode: z.enum(['password', 'invite']), password: password.optional() }),
  z.object({ action: z.literal('create_driver'), email, driver_id: z.string().uuid(), mode: z.enum(['password', 'invite']), password: password.optional() }),
  z.object({ action: z.literal('remove_driver_login'), driver_id: z.string().uuid() }),
  z.object({ action: z.literal('send_reset'), user_id: z.string().uuid() }),
  z.object({ action: z.literal('set_password'), user_id: z.string().uuid(), password }),
  z.object({ action: z.literal('set_banned'), user_id: z.string().uuid(), banned: z.boolean() }),
  z.object({ action: z.literal('status'), user_ids: z.array(z.string().uuid()).min(1).max(50) }),
]);

const fail = (status: number, message: string): ApiResponse => ({ status, body: { error: message } });
const ok = (body: Record<string, unknown>): ApiResponse => ({ status: 200, body });

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function handlePortalAccounts(req: ApiRequest, env: ApiEnv, fetchImpl: Fetch = fetch): Promise<ApiResponse> {
  try {
    if (req.method !== 'POST') return fail(405, 'Use POST');
    if (!env.url || !env.anonKey || !env.secretKey) return fail(500, 'The server is not configured (missing Supabase keys).');
    const token = /^Bearer\s+(.+)$/i.exec(req.authorization ?? '')?.[1];
    if (!token) return fail(401, 'Please sign in again.');

    const call = async (path: string, init: { method?: string; key?: string; bearer?: string; body?: unknown } = {}) => {
      const key = init.key ?? env.secretKey;
      const res = await fetchImpl(`${env.url}${path}`, {
        method: init.method ?? 'GET',
        headers: { apikey: key, Authorization: `Bearer ${init.bearer ?? key}`, 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const text = await res.text();
      let json: unknown = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
      return { status: res.status, ok: res.ok, json: json as Record<string, unknown> | unknown[] | null };
    };
    const rpc = async <T,>(fn: string, args: Record<string, unknown>) => {
      const r = await call(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args });
      if (!r.ok) throw new HttpError(r.status === 400 ? 400 : 502, typeof (r.json as { message?: string })?.message === 'string' ? (r.json as { message: string }).message : 'The database refused the request.');
      return r.json as T;
    };

    // 1. who is calling? (verify the token with Supabase, then require an active admin profile)
    const who = await call('/auth/v1/user', { key: env.anonKey, bearer: token });
    const caller = (who.json as { id?: string } | null)?.id;
    if (!who.ok || !caller) return fail(401, 'Your session has expired. Please sign in again.');
    const prof = await call(`/rest/v1/profiles?id=eq.${caller}&is_active=eq.true&select=id`);
    if (!prof.ok || !Array.isArray(prof.json) || prof.json.length !== 1) return fail(403, 'Only administrators can manage customer accounts.');

    // 2. what do they want?
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid request');
    const input = parsed.data;

    const base = (env.siteUrl || req.origin || '').replace(/\/+$/, '');
    const redirect = /^https?:\/\/[^\s]+$/.test(base) ? `${base}/reset-password` : '';
    const redirectQ = redirect ? `?redirect_to=${encodeURIComponent(redirect)}` : '';

    /** family / customer / driver logins only: never staff, and only logins that actually have a link */
    const isManaged = async (userId: string) => (await rpc<boolean>('portal_admin_has_links', { p_user: userId })) || (await rpc<boolean>('driver_admin_is_driver', { p_user: userId }));
    const requirePortalUser = async (userId: string) => {
      if (await rpc<boolean>('portal_admin_is_staff', { p_user: userId })) throw new HttpError(403, 'That is a staff account — manage it in User Management.');
      if (!(await isManaged(userId))) throw new HttpError(404, 'That login is not a customer, parent or driver account.');
    };
    /** find the login for an email, or create it (with a temporary password, or by emailing an invitation) */
    const findOrCreateLogin = async (mail: string, mode: 'password' | 'invite', pw: string | undefined, meta: Record<string, unknown>) => {
      const existing = await rpc<string | null>('portal_admin_find_user', { p_email: mail });
      if (existing) {
        if (await rpc<boolean>('portal_admin_is_staff', { p_user: existing })) throw new HttpError(409, 'That email belongs to a staff account. Use a different email.');
        return { userId: existing, created: false };
      }
      const r = mode === 'password'
        ? await call('/auth/v1/admin/users', { method: 'POST', body: { email: mail, password: pw, email_confirm: true, user_metadata: { ...meta, must_change_password: true } } })
        : await call(`/auth/v1/invite${redirectQ}`, { method: 'POST', body: { email: mail, data: meta } });
      if (!r.ok) {
        const msg = String((r.json as { msg?: string; message?: string } | null)?.msg ?? (r.json as { message?: string } | null)?.message ?? '');
        if (/rate limit/i.test(msg)) throw new HttpError(429, 'Supabase’s email limit has been reached. Add your own email sender (SMTP) in Supabase, or try again later.');
        if (/password/i.test(msg)) throw new HttpError(400, 'That password was rejected by the password rules. Try a longer, less common one.');
        if (/email/i.test(msg) && /invalid/i.test(msg)) throw new HttpError(400, 'That email address was not accepted.');
        throw new HttpError(502, 'Could not create the login.');
      }
      const id = (r.json as { id?: string } | null)?.id;
      if (!id) throw new HttpError(502, 'Could not create the login.');
      return { userId: id, created: true };
    };
    const getUser = async (userId: string) => {
      const r = await call(`/auth/v1/admin/users/${userId}`);
      if (!r.ok || !r.json || Array.isArray(r.json)) throw new HttpError(404, 'That login no longer exists.');
      return r.json as { id: string; email: string; user_metadata?: Record<string, unknown>; last_sign_in_at?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null; banned_until?: string | null };
    };

    switch (input.action) {
      case 'create': {
        if (input.student_ids.length + input.customer_ids.length === 0) return fail(400, 'Choose at least one student or customer.');
        if (input.mode === 'password' && !input.password) return fail(400, 'Enter a password, or choose to email an invitation instead.');
        const meta = { full_name: input.full_name, ...(input.phone ? { phone: input.phone } : {}) };

        let userId = await rpc<string | null>('portal_admin_find_user', { p_email: input.email });
        let created = false;
        if (userId) {
          if (await rpc<boolean>('portal_admin_is_staff', { p_user: userId })) return fail(409, 'That email belongs to a staff account. Use a different email for the family.');
        } else {
          const r = input.mode === 'password'
            ? await call('/auth/v1/admin/users', { method: 'POST', body: { email: input.email, password: input.password, email_confirm: true, user_metadata: { ...meta, must_change_password: true } } })
            : await call(`/auth/v1/invite${redirectQ}`, { method: 'POST', body: { email: input.email, data: meta } });
          if (!r.ok) {
            const msg = String((r.json as { msg?: string; message?: string; error_description?: string } | null)?.msg ?? (r.json as { message?: string } | null)?.message ?? '');
            if (/rate limit/i.test(msg)) return fail(429, 'Supabase’s email limit has been reached. Add your own email sender (SMTP) in Supabase, or try again later.');
            if (/password/i.test(msg)) return fail(400, 'That password was rejected by the password rules. Try a longer, less common one.');
            if (/email/i.test(msg) && /invalid/i.test(msg)) return fail(400, 'That email address was not accepted.');
            return fail(502, 'Could not create the login.');
          }
          userId = (r.json as { id?: string } | null)?.id ?? null;
          if (!userId) return fail(502, 'Could not create the login.');
          created = true;
        }
        try {
          const linked = await rpc<{ students: number; customers: number }>('portal_admin_link', { p_user: userId, p_students: input.student_ids, p_customers: input.customer_ids, p_by: caller });
          return ok({ user_id: userId, email: input.email, created, mode: created ? input.mode : 'existing', linked });
        } catch (e) {
          if (created) await call(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });   // never leave an orphan login behind
          throw e;
        }
      }
      case 'create_driver': {
        if (input.mode === 'password' && !input.password) return fail(400, 'Enter a password, or choose to email an invitation instead.');
        const name = (await call(`/rest/v1/drivers?id=eq.${input.driver_id}&is_archived=eq.false&select=full_name,phone`)).json;
        if (!Array.isArray(name) || name.length !== 1) return fail(404, 'That driver does not exist.');
        const meta = { full_name: String((name[0] as { full_name: string }).full_name), role_label: 'driver' };
        const { userId, created } = await findOrCreateLogin(input.email, input.mode, input.password, meta);
        try {
          await rpc('driver_admin_link', { p_user: userId, p_driver: input.driver_id, p_by: caller });
          return ok({ user_id: userId, email: input.email, created, mode: created ? input.mode : 'existing' });
        } catch (e) {
          if (created) await call(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
          throw e;
        }
      }
      case 'remove_driver_login': {
        const link = await call(`/rest/v1/drivers?id=eq.${input.driver_id}&select=user_id`);
        const uid = Array.isArray(link.json) ? (link.json[0] as { user_id?: string | null } | undefined)?.user_id : null;
        if (!uid) return ok({ removed: false });
        if (await rpc<boolean>('portal_admin_is_staff', { p_user: uid })) throw new HttpError(403, 'That is a staff account.');
        const r = await call(`/rest/v1/drivers?id=eq.${input.driver_id}`, { method: 'PATCH', body: { user_id: null } });
        if (!r.ok) return fail(502, 'Could not remove the login.');
        // delete the auth user only if it is not also a family login
        if (!(await rpc<boolean>('portal_admin_has_links', { p_user: uid }))) await call(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' });
        return ok({ removed: true });
      }
      case 'send_reset': {
        await requirePortalUser(input.user_id);
        const u = await getUser(input.user_id);
        const r = await call(`/auth/v1/recover${redirectQ}`, { method: 'POST', key: env.anonKey, body: { email: u.email } });
        if (r.status === 429 || /rate limit/i.test(JSON.stringify(r.json))) return fail(429, 'Supabase’s email limit has been reached. Add your own email sender (SMTP) in Supabase, or try again later.');
        if (!r.ok) return fail(502, 'Could not send the email.');
        return ok({ sent_to: u.email });
      }
      case 'set_password': {
        await requirePortalUser(input.user_id);
        const u = await getUser(input.user_id);
        const r = await call(`/auth/v1/admin/users/${input.user_id}`, { method: 'PUT', body: { password: input.password, user_metadata: { ...(u.user_metadata ?? {}), must_change_password: true } } });
        if (!r.ok) return fail(/password/i.test(JSON.stringify(r.json)) ? 400 : 502, /password/i.test(JSON.stringify(r.json)) ? 'That password was rejected by the password rules. Try a longer, less common one.' : 'Could not change the password.');
        return ok({ email: u.email });
      }
      case 'set_banned': {
        await requirePortalUser(input.user_id);
        const r = await call(`/auth/v1/admin/users/${input.user_id}`, { method: 'PUT', body: { ban_duration: input.banned ? '876000h' : 'none' } });
        if (!r.ok) return fail(502, 'Could not update the login.');
        return ok({ banned: input.banned });
      }
      case 'status': {
        const out: Record<string, unknown>[] = [];
        for (const id of input.user_ids) {
          try {
            if (await rpc<boolean>('portal_admin_is_staff', { p_user: id }) || !(await isManaged(id))) continue;
            const u = await getUser(id);
            out.push({ id, email: u.email, last_sign_in_at: u.last_sign_in_at ?? null, confirmed: !!(u.email_confirmed_at ?? u.confirmed_at), banned: !!u.banned_until && new Date(u.banned_until) > new Date(), must_change_password: u.user_metadata?.must_change_password === true });
          } catch { /* a login that vanished is simply left out */ }
        }
        return ok({ users: out });
      }
    }
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    return fail(500, 'Something went wrong on the server.');
  }
}
