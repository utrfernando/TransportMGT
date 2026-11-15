// Customer / parent portal: proves a signed-in portal user can only ever see the records linked to them by a one-time
// access code, and nothing else.   npm run test:db
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
const rows = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await rows(sql))[0];

const ADMIN = '00000000-0000-0000-0000-000000000001', P1 = '00000000-0000-0000-0000-0000000000a1', P2 = '00000000-0000-0000-0000-0000000000a2', P3 = '00000000-0000-0000-0000-0000000000a3';
const BUS = '10000000-0000-0000-0000-000000000001', VAN = '10000000-0000-0000-0000-000000000002';
const C1 = '20000000-0000-0000-0000-000000000001', C2 = '20000000-0000-0000-0000-000000000002';
const SCH = '30000000-0000-0000-0000-000000000001', S1 = '50000000-0000-0000-0000-000000000001', S2 = '50000000-0000-0000-0000-000000000002';

const asAdmin = () => db.exec(`reset role; set request.uid='${ADMIN}'`);
const asUser = (uid) => db.exec(`reset role; set request.uid='${uid}'; set role authenticated`);
const asAnon = () => db.exec(`reset role; set request.uid=''; set role anon`);
/** Run `fn` as another user, always returning to the admin session afterwards. */
const as = async (uid, fn) => { await asUser(uid); try { return await fn(); } finally { await asAdmin(); } };
const overview = (uid) => as(uid, async () => (await one(`select portal_overview() r`)).r);
const claim = (uid, code) => as(uid, async () => (await one(`select portal_claim_invite('${code}') r`)).r);
const tableRows = (uid, fn) => as(uid, async () => rows(`select * from ${fn}()`));

before(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true),'')::uuid $$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text); alter table storage.objects enable row level security;`);
  for (const f of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(join(migrations, f), 'utf8'));
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
      ('${ADMIN}','owner@x.com', now(), '{}'), ('${P1}','parent1@x.com', now(), '{"full_name":"Parent One"}'),
      ('${P2}','parent2@x.com', now(), '{"full_name":"Parent Two"}'), ('${P3}','unconfirmed@x.com', null, '{}');
    insert into profiles(id,email,full_name,role) values ('${ADMIN}','owner@x.com','Owner','OWNER');
    set request.uid='${ADMIN}';
    insert into vehicles(id,name,vehicle_type,registration_number,seating_capacity) values ('${BUS}','Blue Bus','bus','SECRET-REG-1',40),('${VAN}','White Van','van','SECRET-REG-2',12);
    insert into customers(id,full_name,phone) values ('${C1}','Hirer One','0771111111'),('${C2}','Hirer Two','0772222222');
    insert into schools(id,name) values ('${SCH}','School');
    insert into students(id,full_name,school_id,guardian_name,guardian_phone,monthly_fee,start_date,vehicle_id,notes) values
      ('${S1}','Child One','${SCH}','Parent One','0711111111',5000,'2026-01-01','${BUS}','internal note one'),
      ('${S2}','Child Two','${SCH}','Parent Two','0712222222',7000,'2026-01-01','${BUS}','internal note two');
    insert into transport_routes(id,name,school_id,vehicle_id,departure_time,return_time) values ('90000000-0000-0000-0000-000000000001','Morning run','${SCH}','${BUS}','06:30','08:00');
    insert into route_stops(route_id,stop_type,name,sequence) values ('90000000-0000-0000-0000-000000000001','pickup','Main Junction',0);
    insert into student_route_assignments(student_id,route_id) values ('${S1}','90000000-0000-0000-0000-000000000001');`);
  await db.exec(`select * from generate_monthly_invoices('2026-10-01')`);
  const i1 = (await one(`select id from invoices where student_id='${S1}'`)).id, i2 = (await one(`select id from invoices where student_id='${S2}'`)).id;
  await db.exec(`insert into payments(reference,amount,category,invoice_id) values ('',2000,'other','${i1}'),('',1000,'other','${i2}')`);
  const bk = (id, cust, veh, day, fee) => `insert into hire_bookings(id,customer_id,vehicle_id,hire_type,start_at,end_at,agreed_price,fuel_cost,status,notes)
    values ('${id}','${cust}','${veh}','van_hire','2027-02-${day} 09:00+05:30','2027-02-${day} 12:00+05:30',${fee},500,'confirmed','private booking note')`;
  await db.exec(bk('60000000-0000-0000-0000-000000000001', C1, VAN, '01', 10000)); await db.exec(bk('60000000-0000-0000-0000-000000000002', C2, VAN, '02', 20000));
  await db.exec(`insert into payments(reference,amount,category,booking_id) values ('',4000,'other','60000000-0000-0000-0000-000000000001'),('',9000,'other','60000000-0000-0000-0000-000000000002')`);
});

test('only an admin can issue access codes (and only for records that exist)', async () => {
  await as(P1, () => assert.rejects(() => db.query(`select create_portal_invite(array['${S1}']::uuid[], '{}', 14, null)`), /not authorised/));
  await assert.rejects(() => db.query(`select create_portal_invite('{}', '{}', 14, null)`), /at least one/);
  await assert.rejects(() => db.query(`select create_portal_invite(array['00000000-0000-0000-0000-00000000dead']::uuid[], '{}', 14, null)`), /does not exist/);
  await assert.rejects(() => db.query(`select create_portal_invite(array['${S1}']::uuid[], '{}', 999, null)`), /1 to 60 days/);
});

test('a brand-new account sees nothing', async () => {
  assert.deepEqual(await overview(P1), { students: [], customers: [] });
  for (const fn of ['portal_invoices', 'portal_payments', 'portal_bookings']) assert.equal((await tableRows(P1, fn)).length, 0, fn);
});

test('a code is claimed once, needs a confirmed email, and is stored only as a hash', async () => {
  const inv = (await one(`select create_portal_invite(array['${S1}']::uuid[], array['${C1}']::uuid[], 14, 'Family one') r`)).r;
  assert.match(inv.code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  assert.equal(JSON.stringify(await rows(`select * from portal_invites`)).includes(inv.code), false);
  await as(P3, () => assert.rejects(() => db.query(`select portal_claim_invite('${inv.code}')`), /confirm your email/));
  const typed = inv.code.toLowerCase().replace(/-/g, ' ');                       // forgiving about case, dashes and spaces
  assert.deepEqual(await claim(P1, typed), { ok: true, students: 1, customers: 1 });
  const again = await claim(P2, inv.code);                                       // single use
  assert.equal(again.ok, false); assert.match(again.error, /not valid|already used/);
  assert.equal((await one(`select count(*)::int n from portal_links where revoked_at is null`)).n, 2);
});

test('a parent sees their own child and hires with curated fields — never anyone else’s', async () => {
  const ov = await overview(P1);
  assert.deepEqual(ov.students.map(s => s.name), ['Child One']);
  assert.equal(ov.students[0].route.name, 'Morning run');
  assert.equal(ov.students[0].route.vehicle, 'Blue Bus');
  assert.equal(ov.students[0].outstanding, 3000);
  assert.deepEqual(ov.customers.map(c => c.name), ['Hirer One']);
  const everything = JSON.stringify([ov, await tableRows(P1, 'portal_invoices'), await tableRows(P1, 'portal_payments'), await tableRows(P1, 'portal_bookings')]);
  for (const secret of ['Child Two', 'Hirer Two', 'SECRET-REG', 'internal note', 'private booking note', 'fuel_cost', '0712222222', '0772222222']) assert.ok(!everything.includes(secret), `leaked: ${secret}`);
  const inv = await tableRows(P1, 'portal_invoices');
  assert.ok(inv.length > 0 && inv.every(i => i.student_name === 'Child One'));
  const pay = await tableRows(P1, 'portal_payments');
  assert.deepEqual(pay.map(p => p.kind).sort(), ['hire', 'school']);
  assert.ok(pay.every(p => ['Child One', 'Hirer One'].includes(p.person_name)));
  const bk = await tableRows(P1, 'portal_bookings');
  assert.deepEqual(bk.map(b => [b.customer_name, Number(b.agreed_price), Number(b.paid), Number(b.balance)]), [['Hirer One', 10000, 4000, 6000]]);
});

test('a portal user has no direct access to any business table or admin function', async () => {
  await asUser(P1);
  try {
    for (const t of ['students', 'invoices', 'payments', 'customers', 'hire_bookings', 'vehicles', 'drivers', 'expenses', 'portal_links', 'portal_invites', 'profiles', 'audit_logs']) {
      let seen = 0; try { seen = (await db.query(`select * from ${t}`)).rows.length; } catch { /* permission denied */ }
      assert.equal(seen, 0, `${t} must not be readable`);
    }
    for (const f of ['dashboard_summary(current_date,current_date)', 'generate_notifications()', `generate_monthly_invoices(date '2026-12-01')`, 'mark_overdue_invoices()'])
      await assert.rejects(() => db.query(`select ${f}`), /not authorised|permission denied/, f);
    await assert.rejects(() => db.exec(`insert into payments(reference,amount,category) values ('x',1,'other')`), /permission denied|row-level security/);
    await assert.rejects(() => db.exec(`update students set monthly_fee = 0`), /permission denied|row-level security/);
  } finally { await asAdmin(); }
  await asAnon();
  try { for (const f of ['portal_overview()', 'portal_invoices()', `portal_claim_invite('AAAA-BBBB-CCCC')`, `create_portal_invite('{}','{}',1,null)`]) await assert.rejects(() => db.query(`select ${f.includes('(') && !f.includes("'") ? '* from ' : ''}${f}`), /permission denied/, f); }
  finally { await asAdmin(); }
});

test('wrong codes are rate-limited; expired and revoked codes fail', async () => {
  await db.exec(`delete from portal_claim_attempts`);
  for (let i = 0; i < 5; i++) { const r = await claim(P2, `WRONG-CODE-${i}`); assert.equal(r.ok, false); assert.match(r.error, /not valid/); }
  assert.equal((await one(`select count(*)::int n from portal_claim_attempts where not ok`)).n, 5);          // failures are really recorded
  await as(P2, () => assert.rejects(() => db.query(`select portal_claim_invite('WRONG-CODE-9')`), /Too many wrong codes/));
  const good = (await one(`select create_portal_invite(array['${S2}']::uuid[], '{}', 7, null) r`)).r;
  await as(P2, () => assert.rejects(() => db.query(`select portal_claim_invite('${good.code}')`), /Too many wrong codes/));   // even the right code is refused while locked
  await db.exec(`select revoke_portal_invite(id) from portal_invites where used_at is null and revoked_at is null`);
  await db.exec(`delete from portal_claim_attempts`);
  const expired = (await one(`select create_portal_invite(array['${S2}']::uuid[], '{}', 7, null) r`)).r;
  await db.exec(`update portal_invites set expires_at = now() - interval '1 minute' where used_at is null and revoked_at is null`);
  assert.equal((await claim(P2, expired.code)).ok, false);
  await db.exec(`delete from portal_claim_attempts`);
  const revoked = (await one(`select create_portal_invite(array['${S2}']::uuid[], '{}', 7, null) r`)).r;
  await db.exec(`select revoke_portal_invite(id) from portal_invites where used_at is null and revoked_at is null and expires_at > now()`);
  assert.equal((await claim(P2, revoked.code)).ok, false);
});

test('a second parent gets only their own child; revoking a link removes the data at once', async () => {
  await db.exec(`delete from portal_claim_attempts`);
  const inv = (await one(`select create_portal_invite(array['${S2}']::uuid[], array['${C2}']::uuid[], 7, null) r`)).r;
  assert.equal((await claim(P2, inv.code)).ok, true);
  assert.deepEqual((await overview(P2)).students.map(s => s.name), ['Child Two']);
  assert.ok(!JSON.stringify([await tableRows(P2, 'portal_invoices'), await tableRows(P2, 'portal_payments'), await tableRows(P2, 'portal_bookings')]).includes('Child One'));
  await db.exec(`select revoke_portal_link(id) from portal_links where user_id = '${P1}'`);
  assert.deepEqual(await overview(P1), { students: [], customers: [] });
  assert.equal((await tableRows(P1, 'portal_bookings')).length, 0);
  assert.deepEqual((await overview(P2)).students.map(s => s.name), ['Child Two']);   // the other parent is unaffected
});
