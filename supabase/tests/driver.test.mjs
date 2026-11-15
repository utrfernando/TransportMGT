// Driver logins: a driver sees only the routes, students, vehicles and hires assigned to HIM, and nothing else.
//   npm run test:db
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

const ADMIN = '00000000-0000-0000-0000-000000000001', UD1 = '00000000-0000-0000-0000-0000000000d1', UD2 = '00000000-0000-0000-0000-0000000000d2', PAR = '00000000-0000-0000-0000-0000000000a1', NOBODY = '00000000-0000-0000-0000-0000000000f1';
const D1 = '40000000-0000-0000-0000-000000000001', D2 = '40000000-0000-0000-0000-000000000002', D3 = '40000000-0000-0000-0000-000000000003';
const BUS = '10000000-0000-0000-0000-000000000001', VAN = '10000000-0000-0000-0000-000000000002', CAR = '10000000-0000-0000-0000-000000000003';
const SCH = '30000000-0000-0000-0000-000000000001', R1 = '90000000-0000-0000-0000-000000000001', R2 = '90000000-0000-0000-0000-000000000002';
const S1 = '50000000-0000-0000-0000-000000000001', S2 = '50000000-0000-0000-0000-000000000002', C1 = '20000000-0000-0000-0000-000000000001', C2 = '20000000-0000-0000-0000-000000000002';

const asAdmin = () => db.exec(`reset role; set request.uid='${ADMIN}'`);
const asUser = (uid) => db.exec(`reset role; set request.uid='${uid}'; set role authenticated`);
const asService = () => db.exec(`reset role; set request.uid=''; set role service_role`);
const as = async (uid, fn) => { await asUser(uid); try { return await fn(); } finally { await asAdmin(); } };
const svc = async (fn) => { await asService(); try { return await fn(); } finally { await asAdmin(); } };
const overview = (uid) => as(uid, async () => (await one(`select driver_overview() r`)).r);

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true),'')::uuid $$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text); alter table storage.objects enable row level security;`);
  for (const f of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(join(migrations, f), 'utf8'));
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${ADMIN}','owner@x.com',now()),('${UD1}','d1@x.com',now()),('${UD2}','d2@x.com',now()),('${PAR}','parent@x.com',now()),('${NOBODY}','nobody@x.com',now());
    insert into profiles(id,email,full_name,role) values ('${ADMIN}','owner@x.com','Owner','OWNER'); set request.uid='${ADMIN}';
    insert into vehicles(id,name,vehicle_type,registration_number,seating_capacity,notes,odometer_km) values
      ('${BUS}','Blue Bus','bus','BUS-111',40,'PRIVATE-VEHICLE-NOTE',12345),('${VAN}','White Van','van','VAN-222',12,null,0),('${CAR}','Spare Car','other','CAR-333',4,null,0);
    insert into drivers(id,full_name,phone,licence_expiry,assigned_vehicle_id,notes) values
      ('${D1}','Driver One','0711000001','2030-01-01',null,'PRIVATE-DRIVER-NOTE'),('${D2}','Driver Two','0711000002','2030-01-01','${CAR}',null),('${D3}','Driver Three','0711000003',null,null,null);
    insert into schools(id,name) values ('${SCH}','School');
    insert into students(id,full_name,school_id,guardian_name,guardian_phone,monthly_fee,start_date,pickup_location,dropoff_location,notes) values
      ('${S1}','Child One','${SCH}','Guardian One','0712000001',5000,'2026-01-01','Home One','School gate','PRIVATE-STUDENT-NOTE'),
      ('${S2}','Child Two','${SCH}','Guardian Two','0712000002',7000,'2026-01-01','Home Two','School gate',null);
    insert into transport_routes(id,name,school_id,vehicle_id,driver_id,departure_time,return_time) values
      ('${R1}','Morning One','${SCH}','${BUS}','${D1}','06:30','08:00'),('${R2}','Morning Two','${SCH}','${VAN}','${D2}','06:30','08:00');
    insert into route_stops(route_id,stop_type,name,sequence,latitude,longitude) values ('${R1}','pickup','Junction One',0,6.9,79.8),('${R2}','pickup','Junction Two',0,6.8,79.9);
    insert into student_route_assignments(student_id,route_id) values ('${S1}','${R1}'),('${S2}','${R2}');
    insert into customers(id,full_name,phone,notes) values ('${C1}','Hirer One','0773000001','PRIVATE-CUSTOMER-NOTE'),('${C2}','Hirer Two','0773000002',null);
    insert into hire_bookings(customer_id,vehicle_id,hire_type,start_at,end_at,agreed_price,fuel_cost,status,assigned_driver_id,arrangement,notes) values
      ('${C1}','${VAN}','van_hire', now() + interval '3 days', now() + interval '3 days 5 hours', 99999, 777,'confirmed','${D1}','external_driver','PRIVATE-BOOKING-NOTE'),
      ('${C2}','${VAN}','van_hire', now() + interval '5 days', now() + interval '5 days 5 hours', 88888, 666,'confirmed','${D2}','external_driver',null),
      ('${C2}','${CAR}','private',  now() + interval '8 days', now() + interval '8 days 2 hours', 5000, 0,'quotation_sent','${D1}','external_driver',null);`);
});

test('only the server can link a driver login; staff accounts and double links are refused', async () => {
  for (const who of [ADMIN, UD1]) await as(who, () => assert.rejects(() => db.query(`select driver_admin_link('${UD1}', '${D1}', null)`), /permission denied/));
  await svc(async () => {
    await assert.rejects(() => db.query(`select driver_admin_link('${ADMIN}', '${D1}', null)`), /staff account/);
    await assert.rejects(() => db.query(`select driver_admin_link('${UD1}', '00000000-0000-0000-0000-00000000dead', null)`), /does not exist/);
    assert.deepEqual((await one(`select driver_admin_link('${UD1}', '${D1}', '${ADMIN}') r`)).r, { driver: 'Driver One' });
    await db.exec(`select driver_admin_link('${UD1}', '${D1}', '${ADMIN}')`);                       // linking the same pair again is harmless
    await assert.rejects(() => db.query(`select driver_admin_link('${UD2}', '${D1}', null)`), /already has a login/);          // one login per driver
    await assert.rejects(() => db.query(`select driver_admin_link('${UD1}', '${D2}', null)`), /already the login of another driver/);
    await db.exec(`select driver_admin_link('${UD2}', '${D2}', '${ADMIN}')`);
    assert.equal((await one(`select driver_admin_is_driver('${UD1}') x`)).x, true);
    assert.equal((await one(`select driver_admin_is_driver('${PAR}') x`)).x, false);
  });
});

test('a driver sees exactly his own routes, students, vehicles and hires', async () => {
  const o = await overview(UD1);
  assert.equal(o.driver.name, 'Driver One');
  assert.deepEqual(o.routes.map(r => r.name), ['Morning One']);
  assert.deepEqual(o.routes[0].students.map(s => [s.name, s.pickup, s.guardian_phone]), [['Child One', 'Home One', '0712000001']]);
  assert.deepEqual([o.routes[0].stops[0].name, o.routes[0].stops[0].lat], ['Junction One', 6.9]);
  assert.deepEqual(o.vehicles.map(v => [v.name, v.registration_number]).sort(), [['Blue Bus', 'BUS-111'], ['White Van', 'VAN-222']]);   // route vehicle + hire vehicle
  assert.deepEqual(o.trips.map(t => [t.customer, t.vehicle]), [['Hirer One', 'White Van']]);                                         // quotation not shown, other driver's hire not shown
  assert.equal(o.trips[0].customer_phone, '0773000001');
});

test('the driver view never contains money, notes, internals or anyone else’s work', async () => {
  const text = JSON.stringify(await overview(UD1));
  for (const secret of ['PRIVATE-', '99999', '88888', '777', '5000', '7000', 'Driver Two', 'Driver Three', 'Child Two', 'Hirer Two', 'Morning Two', 'Junction Two', 'Spare Car', 'CAR-333', '12345', 'fuel_cost', 'agreed_price', 'monthly_fee', '0712000002', '0773000002'])
    assert.ok(!text.includes(secret), `leaked: ${secret}`);
  const o2 = JSON.stringify(await overview(UD2));
  assert.ok(o2.includes('Spare Car') && o2.includes('Child Two') && o2.includes('Hirer Two'));                                      // the other driver sees his own set
  assert.ok(!o2.includes('Child One') && !o2.includes('Hirer One') && !o2.includes('Blue Bus'));
});

test('anyone who is not a driver is refused; driver logins have no table access', async () => {
  for (const uid of [PAR, NOBODY]) await as(uid, () => assert.rejects(() => db.query(`select driver_overview()`), /not set up as a driver/));
  await asAnon(); try { await assert.rejects(() => db.query(`select driver_overview()`), /permission denied/); await assert.rejects(() => db.query(`select portal_whoami()`), /permission denied/); } finally { await asAdmin(); }
  await asUser(UD1);
  try {
    for (const t of ['drivers', 'students', 'transport_routes', 'route_stops', 'hire_bookings', 'customers', 'vehicles', 'payments', 'invoices', 'booking_driver_assignments', 'expenses', 'profiles', 'audit_logs']) {
      let seen = 0; try { seen = (await db.query(`select * from ${t}`)).rows.length; } catch { /* permission denied is the expected outcome */ }
      assert.equal(seen, 0, `${t} must not be readable by a driver`);
    }
    await assert.rejects(() => db.exec(`update transport_routes set name = 'hacked'`), /permission denied|row-level security/);
    await assert.rejects(() => db.exec(`update drivers set user_id = '${UD2}'`), /permission denied|row-level security/);
    for (const f of ['dashboard_summary(current_date,current_date)', 'generate_notifications()']) await assert.rejects(() => db.query(`select ${f}`), /not authorised|permission denied/, f);
  } finally { await asAdmin(); }
});

test('whoami tells a driver from a family; inactive, archived and removed drivers lose access at once', async () => {
  assert.deepEqual(await as(UD1, async () => (await one(`select portal_whoami() r`)).r), { driver: true, family: false });
  assert.deepEqual(await as(NOBODY, async () => (await one(`select portal_whoami() r`)).r), { driver: false, family: false });
  await db.exec(`update drivers set status = 'inactive' where id = '${D2}'`);
  await as(UD2, () => assert.rejects(() => db.query(`select driver_overview()`), /not set up as a driver/));
  await db.exec(`update drivers set status = 'on_leave' where id = '${D2}'`);
  assert.equal((await overview(UD2)).driver.status, 'on_leave');                                  // on leave can still look
  await db.exec(`update drivers set is_archived = true where id = '${D2}'`);
  await as(UD2, () => assert.rejects(() => db.query(`select driver_overview()`), /not set up as a driver/));
  await db.exec(`update drivers set user_id = null where id = '${D1}'`);                          // admin removes the login link
  await as(UD1, () => assert.rejects(() => db.query(`select driver_overview()`), /not set up as a driver/));
});

const asAnon = () => db.exec(`reset role; set request.uid=''; set role anon`);
