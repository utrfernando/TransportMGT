import { beforeEach, describe, expect, it } from 'vitest';
import { handlePortalAccounts, type ApiEnv, type ApiRequest } from './portalAccounts';

const env: ApiEnv = { url: 'https://x.supabase.co', anonKey: 'ANON', secretKey: 'SECRET', siteUrl: 'https://site.example' };
const ADMIN = '11111111-1111-4111-8111-111111111111', FAMILY = '22222222-2222-4222-8222-222222222222', STAFF = '33333333-3333-4333-8333-333333333333', NEW = '44444444-4444-4444-8444-444444444444';
const S1 = '55555555-5555-4555-8555-555555555555', C1 = '66666666-6666-4666-8666-666666666666';

/** A tiny in-memory stand-in for Supabase: records every call and answers like the real service would. */
function fake(opts: { adminToken?: string; existing?: Record<string, string>; staff?: string[]; withLinks?: string[]; linkFails?: boolean; drivers?: string[]; driverRows?: unknown[]; createStatus?: number; createMsg?: string } = {}) {
  const calls: { method: string; path: string; body: unknown; key: string }[] = [];
  const existing = opts.existing ?? { 'family@x.com': FAMILY }, staff = opts.staff ?? [STAFF], withLinks = opts.withLinks ?? [FAMILY];
  const impl = (async (url: string, init: RequestInit = {}) => {
    const path = url.replace(env.url, ''), method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const key = String((init.headers as Record<string, string>).apikey);
    calls.push({ method, path, body, key });
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
    if (path === '/auth/v1/user') return (init.headers as Record<string, string>).Authorization === `Bearer ${opts.adminToken ?? 'admin-token'}` ? json(200, { id: ADMIN }) : json(401, { msg: 'bad jwt' });
    if (path.startsWith('/rest/v1/profiles')) return json(200, path.includes(ADMIN) ? [{ id: ADMIN }] : []);
    if (path === '/rest/v1/rpc/portal_admin_find_user') return json(200, existing[body.p_email] ?? null);
    if (path === '/rest/v1/rpc/portal_admin_is_staff') return json(200, staff.includes(body.p_user));
    if (path === '/rest/v1/rpc/portal_admin_has_links') return json(200, withLinks.includes(body.p_user));
    if (path === '/rest/v1/rpc/driver_admin_is_driver') return json(200, (opts.drivers ?? []).includes(body.p_user));
    if (path === '/rest/v1/rpc/driver_admin_link') return opts.linkFails ? json(400, { message: 'This driver already has a login. Remove it first.' }) : json(200, { driver: 'D' });
    if (path.startsWith('/rest/v1/drivers')) return json(200, opts.driverRows ?? [{ full_name: 'Kapila', user_id: NEW }]);
    if (path === '/rest/v1/rpc/portal_admin_link') return opts.linkFails ? json(400, { message: 'A selected student does not exist' }) : json(200, { students: body.p_students.length, customers: body.p_customers.length });
    if (path === '/auth/v1/admin/users' && method === 'POST') return opts.createStatus ? json(opts.createStatus, { msg: opts.createMsg ?? 'nope' }) : json(200, { id: NEW, email: body.email });
    if (path.startsWith('/auth/v1/invite')) return opts.createStatus ? json(opts.createStatus, { msg: opts.createMsg ?? 'nope' }) : json(200, { id: NEW, email: body.email });
    if (path.startsWith('/auth/v1/recover')) return json(200, {});
    if (path.startsWith('/auth/v1/admin/users/') && method === 'GET') return json(200, { id: path.split('/').pop(), email: 'family@x.com', user_metadata: { full_name: 'Family', keep: 'me' }, last_sign_in_at: '2026-11-01T00:00:00Z', email_confirmed_at: '2026-10-01T00:00:00Z', banned_until: null });
    if (path.startsWith('/auth/v1/admin/users/') && (method === 'PUT' || method === 'DELETE')) return json(200, {});
    return json(404, { message: `unexpected ${method} ${path}` });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const req = (body: unknown, extra: Partial<ApiRequest> = {}): ApiRequest => ({ method: 'POST', authorization: 'Bearer admin-token', origin: 'https://site.example', body, ...extra });
const createBody = (over: Record<string, unknown> = {}) => ({ action: 'create', email: 'New.Parent@X.com ', full_name: 'New Parent', student_ids: [S1], customer_ids: [], mode: 'password', password: 'S3cure-passw0rd', ...over });

let f: ReturnType<typeof fake>;
beforeEach(() => { f = fake(); });

describe('who may call the API', () => {
  it('rejects anything but POST, a missing token and a bad token', async () => {
    expect((await handlePortalAccounts({ ...req({}), method: 'GET' }, env, f.impl)).status).toBe(405);
    expect((await handlePortalAccounts(req(createBody(), { authorization: undefined }), env, f.impl)).status).toBe(401);
    expect((await handlePortalAccounts(req(createBody(), { authorization: 'Bearer forged' }), env, f.impl)).status).toBe(401);
    expect(f.calls.some(c => c.path.includes('/admin/users') || c.path.includes('rpc/portal_admin_link'))).toBe(false);   // nothing was created
  });
  it('rejects a signed-in user who is not an active administrator', async () => {
    const g = fake({ adminToken: 'x' });
    const r = await handlePortalAccounts(req(createBody(), { authorization: 'Bearer x' }), env, (async (u: string, i: RequestInit) => u.endsWith('/auth/v1/user') ? new Response(JSON.stringify({ id: '99999999-9999-4999-8999-999999999999' }), { status: 200 }) : g.impl(u, i)) as unknown as typeof fetch);
    expect(r.status).toBe(403);
    expect(g.calls.some(c => c.path.includes('/admin/users'))).toBe(false);
  });
  it('fails safely if the server has no keys', async () => {
    expect((await handlePortalAccounts(req(createBody()), { ...env, secretKey: '' }, f.impl)).status).toBe(500);
  });
});

describe('creating a family account', () => {
  it('sets the password you typed, confirms the email, forces a change at first sign-in and links the student', async () => {
    const r = await handlePortalAccounts(req(createBody()), env, f.impl);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ user_id: NEW, email: 'new.parent@x.com', created: true, mode: 'password', linked: { students: 1, customers: 0 } });
    const make = f.calls.find(c => c.path === '/auth/v1/admin/users' && c.method === 'POST')!;
    expect(make.body).toMatchObject({ email: 'new.parent@x.com', email_confirm: true, user_metadata: { full_name: 'New Parent', must_change_password: true } });
    expect(make.key).toBe('SECRET');
    expect(f.calls.find(c => c.path.endsWith('portal_admin_link'))!.body).toMatchObject({ p_user: NEW, p_students: [S1], p_by: ADMIN });
    expect(JSON.stringify(r.body)).not.toContain('S3cure');            // the password is never echoed back
  });
  it('emails an invitation (with a redirect to the set-password page) instead of setting a password', async () => {
    const r = await handlePortalAccounts(req(createBody({ mode: 'invite', password: undefined, customer_ids: [C1], student_ids: [] })), env, f.impl);
    expect(r.status).toBe(200);
    const inv = f.calls.find(c => c.path.startsWith('/auth/v1/invite'))!;
    expect(decodeURIComponent(inv.path)).toContain('redirect_to=https://site.example/reset-password');
    expect(inv.body).toMatchObject({ email: 'new.parent@x.com' });
    expect(f.calls.some(c => c.path === '/auth/v1/admin/users')).toBe(false);
    expect(r.body).toMatchObject({ mode: 'invite', linked: { customers: 1 } });
  });
  it('links an email that already has a login (a second child) without touching the existing password', async () => {
    const r = await handlePortalAccounts(req(createBody({ email: 'family@x.com' })), env, f.impl);
    expect(r.body).toMatchObject({ user_id: FAMILY, created: false, mode: 'existing' });
    expect(f.calls.some(c => c.path === '/auth/v1/admin/users' && c.method === 'POST')).toBe(false);
    expect(f.calls.some(c => c.method === 'PUT')).toBe(false);
  });
  it('refuses to attach a staff email to a family', async () => {
    const g = fake({ existing: { 'owner@x.com': STAFF } });
    const r = await handlePortalAccounts(req(createBody({ email: 'owner@x.com' })), env, g.impl);
    expect(r.status).toBe(409);
    expect(g.calls.some(c => c.path.endsWith('portal_admin_link'))).toBe(false);
  });
  it('deletes a freshly made login if linking fails, so nothing is left half-created', async () => {
    const g = fake({ linkFails: true });
    const r = await handlePortalAccounts(req(createBody()), env, g.impl);
    expect(r.status).toBe(400);
    expect(g.calls.some(c => c.method === 'DELETE' && c.path === `/auth/v1/admin/users/${NEW}`)).toBe(true);
  });
  it('validates the input before touching anything', async () => {
    for (const bad of [createBody({ email: 'nope' }), createBody({ password: 'short' }), createBody({ password: undefined }), createBody({ student_ids: [], customer_ids: [] }), createBody({ student_ids: ['not-a-uuid'] }), createBody({ full_name: '' }), createBody({ mode: 'magic' }), { action: 'delete_everything' }]) {
      const g = fake();
      expect((await handlePortalAccounts(req(bad), env, g.impl)).status, JSON.stringify(bad)).toBe(400);
      expect(g.calls.some(c => c.path.includes('/admin/users') || c.path.includes('invite'))).toBe(false);
    }
  });
  it('turns Supabase’s email-limit error into a plain explanation', async () => {
    const g = fake({ createStatus: 429, createMsg: 'email rate limit exceeded' });
    const r = await handlePortalAccounts(req(createBody({ mode: 'invite', password: undefined })), env, g.impl);
    expect(r.status).toBe(429);
    expect(String(r.body.error)).toMatch(/SMTP/);
  });
});

describe('managing an existing family login', () => {
  it('emails a password-reset link to the login’s own address', async () => {
    const r = await handlePortalAccounts(req({ action: 'send_reset', user_id: FAMILY }), env, f.impl);
    expect(r.body).toEqual({ sent_to: 'family@x.com' });
    expect(f.calls.find(c => c.path.startsWith('/auth/v1/recover'))!.body).toEqual({ email: 'family@x.com' });
  });
  it('sets a new password, keeps the other profile data and forces a change at next sign-in', async () => {
    const r = await handlePortalAccounts(req({ action: 'set_password', user_id: FAMILY, password: 'Another-Str0ng-One' }), env, f.impl);
    expect(r.status).toBe(200);
    const put = f.calls.find(c => c.method === 'PUT')!;
    expect(put.body).toMatchObject({ password: 'Another-Str0ng-One', user_metadata: { keep: 'me', must_change_password: true } });
    expect(JSON.stringify(r.body)).not.toContain('Another');
  });
  it('can disable and re-enable a login', async () => {
    await handlePortalAccounts(req({ action: 'set_banned', user_id: FAMILY, banned: true }), env, f.impl);
    await handlePortalAccounts(req({ action: 'set_banned', user_id: FAMILY, banned: false }), env, f.impl);
    const puts = f.calls.filter(c => c.method === 'PUT').map(c => (c.body as { ban_duration: string }).ban_duration);
    expect(puts).toEqual(['876000h', 'none']);
  });
  it('can NEVER be used on a staff account, nor on a login that is not a customer account', async () => {
    for (const body of [{ action: 'send_reset', user_id: STAFF }, { action: 'set_password', user_id: STAFF, password: 'Another-Str0ng-One' }, { action: 'set_banned', user_id: STAFF, banned: true }]) {
      const g = fake();
      expect((await handlePortalAccounts(req(body), env, g.impl)).status).toBe(403);
      expect(g.calls.some(c => c.method === 'PUT' || c.path.startsWith('/auth/v1/recover'))).toBe(false);
    }
    const stranger = '77777777-7777-4777-8777-777777777777';
    expect((await handlePortalAccounts(req({ action: 'set_banned', user_id: stranger, banned: true }), env, f.impl)).status).toBe(404);
  });
  it('reports sign-in status only for family logins', async () => {
    const r = await handlePortalAccounts(req({ action: 'status', user_ids: [FAMILY, STAFF] }), env, f.impl);
    expect(r.body.users).toEqual([{ id: FAMILY, email: 'family@x.com', last_sign_in_at: '2026-11-01T00:00:00Z', confirmed: true, banned: false, must_change_password: false }]);
  });
});

describe('driver accounts', () => {
  const DR = '88888888-8888-4888-8888-888888888888';
  const body = (over: Record<string, unknown> = {}) => ({ action: 'create_driver', email: 'Kapila@X.com', driver_id: DR, mode: 'password', password: 'S3cure-passw0rd', ...over });
  it('creates the login for the driver, forces a password change and links it', async () => {
    const r = await handlePortalAccounts(req(body()), env, f.impl);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ user_id: NEW, email: 'kapila@x.com', created: true });
    expect(f.calls.find(c => c.path === '/auth/v1/admin/users' && c.method === 'POST')!.body).toMatchObject({ email_confirm: true, user_metadata: { must_change_password: true } });
    expect(f.calls.find(c => c.path.endsWith('driver_admin_link'))!.body).toMatchObject({ p_user: NEW, p_driver: DR, p_by: ADMIN });
    expect(JSON.stringify(r.body)).not.toContain('S3cure');
  });
  it('refuses a staff email and removes a fresh login if linking fails', async () => {
    const g = fake({ existing: { 'kapila@x.com': STAFF } });
    expect((await handlePortalAccounts(req(body()), env, g.impl)).status).toBe(409);
    const h = fake({ linkFails: true });
    expect((await handlePortalAccounts(req(body()), env, h.impl)).status).toBe(400);
    expect(h.calls.some(c => c.method === 'DELETE' && c.path === `/auth/v1/admin/users/${NEW}`)).toBe(true);
  });
  it('can manage a driver login but still never a staff one', async () => {
    const g = fake({ drivers: [NEW] });
    expect((await handlePortalAccounts(req({ action: 'set_banned', user_id: NEW, banned: true }), env, g.impl)).status).toBe(200);
    expect((await handlePortalAccounts(req({ action: 'set_banned', user_id: STAFF, banned: true }), env, g.impl)).status).toBe(403);
  });
  it('removing a driver login unlinks it and deletes the login unless it is also a family login', async () => {
    const g = fake({ driverRows: [{ user_id: NEW }] });
    expect((await handlePortalAccounts(req({ action: 'remove_driver_login', driver_id: DR }), env, g.impl)).body).toMatchObject({ removed: true });
    expect(g.calls.some(c => c.method === 'DELETE' && c.path === `/auth/v1/admin/users/${NEW}`)).toBe(true);
    const h = fake({ driverRows: [{ user_id: FAMILY }] });
    await handlePortalAccounts(req({ action: 'remove_driver_login', driver_id: DR }), env, h.impl);
    expect(h.calls.some(c => c.method === 'DELETE')).toBe(false);
  });
});
