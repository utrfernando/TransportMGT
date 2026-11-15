// Live security check against YOUR Supabase project: proves what the public, a signed-in non-admin,
// an ADMIN-role user and a deactivated admin can and cannot do.
//   node scripts/security-check.mjs
// Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SECRET_KEY in .env (server-side only).
// It creates 3 throw-away auth users + 1 throw-away vehicle and deletes them at the end.
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (existsSync('.env')) for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const URL_ = process.env.VITE_SUPABASE_URL, ANON = process.env.VITE_SUPABASE_ANON_KEY, SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !ANON || !SECRET) { console.error('Missing env vars'); process.exit(1); }

const results = [];
// ok === null means "could not be determined": reported as WARN, neither a pass nor a fail
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok === null ? 'WARN' : ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '   <-- ' + detail}`); };
const rest = (path, { key = ANON, token, method = 'GET', body, headers = {} } = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...headers }, body: body ? JSON.stringify(body) : undefined });
const json = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const denied = async (r) => { if (r.status === 401 || r.status === 403) return true; const j = await json(r); return !!(j && (j.code === '42501' || /permission denied|row-level security|not authorised/i.test(j.message ?? ''))); };
const emptyOrDenied = async (r) => { if (await denied(r.clone())) return true; const j = await json(r); return r.status < 300 && Array.isArray(j) && j.length === 0; };

const PRIVATE = ['profiles', 'business_settings', 'vehicles', 'drivers', 'vehicle_documents', 'vehicle_maintenance', 'fuel_records', 'customers', 'schools', 'school_contracts', 'transport_routes',
  'route_stops', 'students', 'student_route_assignments', 'hire_bookings', 'booking_driver_assignments', 'booking_expenses', 'expense_categories', 'invoices', 'invoice_items', 'school_invoices',
  'payments', 'expenses', 'public_inquiries', 'notifications', 'audit_logs'];
const PUBLIC_READ = ['services', 'website_content', 'public_vehicle_listings', 'public_vehicles'];
const ADMIN_RPC = [['dashboard_summary', { p_from: '2026-01-01', p_to: '2026-12-31' }], ['generate_notifications', {}], ['rpt_position', { p_from: '2026-01-01', p_to: '2026-12-31' }],
  ['rpt_vehicle_summary', { p_from: '2026-01-01', p_to: '2026-12-31' }], ['rpt_cash_matrix', { p_kind: 'income', p_group: 'month', p_from: '2026-01-01', p_to: '2026-12-31' }],
  ['generate_monthly_invoices', { p_month: '2026-01-01' }], ['mark_overdue_invoices', {}]];

const authAdmin = (path, body, method = 'POST') => fetch(`${URL_}/auth/v1/${path}`, { method, headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const created = [];
async function makeUser(label, profile) {
  const email = `sec-${label}-${randomBytes(4).toString('hex')}@example.com`, password = randomBytes(12).toString('base64url') + 'aA1!';
  const r = await authAdmin('admin/users', { email, password, email_confirm: true });
  const u = await json(r); if (!r.ok) throw new Error('create user failed: ' + JSON.stringify(u));
  created.push(u.id);
  if (profile) { const p = await rest('profiles', { key: SECRET, method: 'POST', body: { id: u.id, email, full_name: `SEC ${label}`, ...profile } }); if (!p.ok) throw new Error('profile failed: ' + await p.text()); }
  const t = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const tj = await json(t); if (!t.ok) throw new Error('sign-in failed: ' + JSON.stringify(tj));
  return { id: u.id, token: tj.access_token };
}

let target; // a vehicle we try (and must fail) to modify
try {
  const tv = await json(await rest('vehicles', { key: SECRET, method: 'POST', body: { name: 'SEC-CHECK', vehicle_type: 'van', registration_number: 'SEC-' + randomBytes(3).toString('hex'), seating_capacity: 5 } }));
  target = tv[0].id;

  console.log('\n== 1. Public visitor (no login) ==');
  for (const t of PRIVATE) { const r = await rest(`${t}?select=*&limit=1`); check(`anon cannot read ${t}`, await denied(r), `status ${r.status}`); }
  for (const t of PUBLIC_READ) { const r = await rest(`${t}?select=*&limit=1`); check(`anon can read public ${t}`, r.status === 200); }
  const pv = await json(await rest('public_vehicles?select=*&limit=1'));
  check('public_vehicles never exposes registration number or notes', !Array.isArray(pv) || pv.length === 0 || (!('registration_number' in pv[0]) && !('notes' in pv[0]) && !('odometer_km' in pv[0])));
  for (const [t, body] of [['public_inquiries', { customer_name: 'x', phone: '0770000000', service: 'x' }], ['vehicles', { name: 'x', vehicle_type: 'van', registration_number: 'X', seating_capacity: 1 }], ['payments', { reference: 'x', amount: 1, category: 'other' }], ['profiles', { id: '00000000-0000-0000-0000-000000000000', email: 'a@b.c', full_name: 'x', role: 'OWNER' }]])
    check(`anon cannot insert into ${t}`, await denied(await rest(t, { method: 'POST', body })));
  check('anon cannot modify services', await emptyOrDenied(await rest('services?slug=eq.bus-hire', { method: 'PATCH', body: { title: 'hacked' } })));
  check('anon cannot delete services', await emptyOrDenied(await rest('services?slug=eq.bus-hire', { method: 'DELETE' })));
  for (const [fn, args] of ADMIN_RPC) check(`anon cannot call ${fn}()`, await denied(await rest(`rpc/${fn}`, { method: 'POST', body: args })));
  const inq = await rest('rpc/submit_inquiry', { method: 'POST', body: { p_name: '', p_phone: '1', p_email: null, p_service: 'x', p_vehicle: null, p_pickup: null, p_destination: null, p_travel_date: null, p_passengers: null, p_driver: null, p_message: null } });
  check('submit_inquiry is reachable and validates input (rejects empty name)', inq.status === 400 && /Name is required/i.test(JSON.stringify(await json(inq))));
  check('anon cannot read private storage', (await fetch(`${URL_}/storage/v1/object/private-files/does-not-exist.png`, { headers: { apikey: ANON } })).status >= 400);
  const up = await fetch(`${URL_}/storage/v1/object/public-assets/hack-${randomBytes(3).toString('hex')}.png`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'image/png' }, body: 'x' });
  check('anon cannot upload to public-assets', up.status >= 400);
  // A real-looking address is needed: Supabase rejects example.com as "invalid" BEFORE it checks whether sign-up is allowed.
  const su = await fetch(`${URL_}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `secprobe${randomBytes(8).toString('hex')}@gmail.com`, password: randomBytes(10).toString('base64url') + 'aA1!' }) });
  const suj = await json(su); if (suj?.id || suj?.user?.id) created.push(suj.id ?? suj.user.id);
  // Supabase applies its email-send rate limit BEFORE it checks whether sign-up is allowed, so once the hourly email quota is
  // used up (for example by an earlier run) this probe cannot tell. Say so honestly instead of guessing.
  const limited = suj?.error_code === 'over_email_send_rate_limit';
  check('public sign-up is disabled (Supabase → Authentication → Sign In / Providers → turn OFF "Allow new users to sign up")',
    limited ? null : suj?.error_code === 'signup_disabled',
    limited ? 'CANNOT BE DETERMINED right now: the email rate limit is used up. Confirm the toggle in the dashboard, or re-run in about an hour.'
      : `sign-up is OPEN (${su.status} ${suj?.error_code ?? 'created'}): strangers can create auth accounts and trigger confirmation emails. They get NO data access, but this can exhaust your email quota and block password-reset emails`);

  console.log('\n== 2. Signed-in user with NO admin profile ==');
  const nobody = await makeUser('nobody', null);
  for (const t of PRIVATE) check(`non-admin sees nothing in ${t}`, await emptyOrDenied(await rest(`${t}?select=*&limit=5`, { token: nobody.token })));
  check('non-admin cannot insert a vehicle', await denied(await rest('vehicles', { token: nobody.token, method: 'POST', body: { name: 'x', vehicle_type: 'van', registration_number: 'NA-1', seating_capacity: 1 } })));
  check('non-admin cannot create themselves a profile', await denied(await rest('profiles', { token: nobody.token, method: 'POST', body: { id: nobody.id, email: 'n@x.com', full_name: 'x', role: 'OWNER' } })));
  check('non-admin cannot update a vehicle', await emptyOrDenied(await rest(`vehicles?id=eq.${target}`, { token: nobody.token, method: 'PATCH', body: { name: 'HACKED' } })));
  check('non-admin cannot delete a vehicle', await emptyOrDenied(await rest(`vehicles?id=eq.${target}`, { token: nobody.token, method: 'DELETE' })));
  for (const [fn, args] of ADMIN_RPC) { const r = await rest(`rpc/${fn}`, { token: nobody.token, method: 'POST', body: args }); check(`non-admin blocked from ${fn}()`, await denied(r) || (r.status >= 400)); }
  check('non-admin cannot read private files', (await fetch(`${URL_}/storage/v1/object/authenticated/private-files/x.png`, { headers: { apikey: ANON, Authorization: `Bearer ${nobody.token}` } })).status >= 400);

  console.log('\n== 3. ADMIN role (not owner) ==');
  const admin = await makeUser('admin', { role: 'ADMIN', is_active: true });
  const rv = await rest(`vehicles?id=eq.${target}&select=name`, { token: admin.token });
  check('ADMIN can read operational data', rv.status === 200 && (await json(rv)).length === 1);
  const own = await json(await rest('profiles?role=eq.OWNER&select=id&limit=1', { key: SECRET }));
  if (own.length) {
    check('ADMIN cannot demote/modify the owner profile', await emptyOrDenied(await rest(`profiles?id=eq.${own[0].id}`, { token: admin.token, method: 'PATCH', body: { is_active: false } })));
    const still = await json(await rest(`profiles?id=eq.${own[0].id}&select=is_active`, { key: SECRET })); check('owner profile unchanged after attempt', still[0]?.is_active === true);
  }
  check('ADMIN cannot create another admin profile', await denied(await rest('profiles', { token: admin.token, method: 'POST', body: { id: nobody.id, email: 'n@x.com', full_name: 'x', role: 'ADMIN' } })));
  check('ADMIN cannot promote themselves to OWNER', await emptyOrDenied(await rest(`profiles?id=eq.${admin.id}`, { token: admin.token, method: 'PATCH', body: { role: 'OWNER' } })));
  const me = await json(await rest(`profiles?id=eq.${admin.id}&select=role`, { key: SECRET })); check('ADMIN role unchanged after promotion attempt', me[0]?.role === 'ADMIN');
  check('ADMIN cannot edit audit_logs', await emptyOrDenied(await rest('audit_logs?id=gt.0', { token: admin.token, method: 'PATCH', body: { action: 'x' } })));
  check('ADMIN cannot delete audit_logs', await emptyOrDenied(await rest('audit_logs?id=gt.0', { token: admin.token, method: 'DELETE' })));
  check('ADMIN cannot forge audit_logs', await denied(await rest('audit_logs', { token: admin.token, method: 'POST', body: { table_name: 'x', action: 'INSERT' } })));
  const bad = await rest('payments', { token: admin.token, method: 'POST', body: { reference: '', amount: -5, category: 'other' } });
  check('database rejects a negative payment even from an admin', bad.status >= 400);
  check('ADMIN can call dashboard_summary()', (await rest('rpc/dashboard_summary', { token: admin.token, method: 'POST', body: { p_from: '2026-01-01', p_to: '2026-12-31' } })).status === 200);

  console.log('\n== 4. Deactivated admin ==');
  const gone = await makeUser('gone', { role: 'ADMIN', is_active: false });
  check('deactivated admin sees no vehicles', await emptyOrDenied(await rest('vehicles?select=*', { token: gone.token })));
  check('deactivated admin blocked from RPCs', (await rest('rpc/dashboard_summary', { token: gone.token, method: 'POST', body: { p_from: '2026-01-01', p_to: '2026-12-31' } })).status >= 400);

  const after = await json(await rest(`vehicles?id=eq.${target}&select=name`, { key: SECRET }));
  check('target vehicle was never modified or deleted by any attacker', after.length === 1 && after[0].name === 'SEC-CHECK');
} finally {
  if (target) await rest(`vehicles?id=eq.${target}`, { key: SECRET, method: 'DELETE' });
  for (const id of created) await authAdmin(`admin/users/${id}`, null, 'DELETE');
}
const failed = results.filter(r => r.ok === false), warned = results.filter(r => r.ok === null);
console.log(`\n${results.filter(r => r.ok).length}/${results.length} checks passed${failed.length ? `, ${failed.length} FAILED` : ''}${warned.length ? `, ${warned.length} could not be determined (WARN)` : ''}`);
process.exit(failed.length ? 1 : 0);
