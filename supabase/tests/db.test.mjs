// Business-rule tests for the SQL migrations. They run against an in-process Postgres (PGlite),
// so no Supabase project or network is needed:   npm run test:db
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
const rejects = (sql, re) => assert.rejects(() => db.exec(sql), re);
const asAdmin = () => db.exec(`reset role; set request.uid='${U}'`);
const asAnon = () => db.exec(`set request.uid=''; set role anon`);

const U = '00000000-0000-0000-0000-000000000001';
const BUS = '10000000-0000-0000-0000-000000000001', VAN = '10000000-0000-0000-0000-000000000002';
const CUST = '20000000-0000-0000-0000-000000000001', SCH = '30000000-0000-0000-0000-000000000001';
const DRV = '40000000-0000-0000-0000-000000000001', STU = '50000000-0000-0000-0000-000000000001', BK = '60000000-0000-0000-0000-000000000001';
const booking = (id, veh, s, e, status, extraCols = '', extraVals = '') =>
  `insert into hire_bookings(id,customer_id,vehicle_id,hire_type,start_at,end_at,agreed_price,status${extraCols ? ',' + extraCols : ''}) values ('${id}','${CUST}','${veh}','bus_hire','${s}','${e}',10000,'${status}'${extraVals ? ',' + extraVals : ''})`;

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true),'')::uuid $$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text); alter table storage.objects enable row level security;`);
  for (const f of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(join(migrations, f), 'utf8'));
  await db.exec(`insert into auth.users(id) values ('${U}'); insert into profiles(id,email,full_name,role) values ('${U}','o@x.com','Owner','OWNER'); set request.uid='${U}';
    insert into vehicles(id,name,vehicle_type,registration_number,seating_capacity,odometer_km) values ('${BUS}','Bus','bus','NB-1',40,100),('${VAN}','Van','van','NB-2',12,0);
    insert into customers(id,full_name,phone) values ('${CUST}','Cust','077 123 4567');
    insert into drivers(id,full_name,phone,licence_expiry) values ('${DRV}','Drv','0711111111','2026-12-01');
    insert into schools(id,name) values ('${SCH}','School');
    insert into students(id,full_name,school_id,guardian_name,guardian_phone,monthly_fee,start_date,vehicle_id) values ('${STU}','Kid','${SCH}','G','0711111111',5000,'2026-01-01','${BUS}');
    insert into transport_routes(name,school_id,vehicle_id,departure_time,return_time) values ('AM run','${SCH}','${BUS}','06:30','08:00');`);
});

test('duplicate vehicles and customers are rejected', async () => {
  await rejects(`insert into vehicles(name,vehicle_type,registration_number,seating_capacity) values ('x','van','nb-1',5)`, /uq_vehicles_reg/);
  await rejects(`insert into customers(full_name,phone) values ('Dup','0771234567')`, /uq_customers_phone/);
});

test('monthly invoicing is idempotent and pro-rates part months', async () => {
  await db.exec(`insert into students(full_name,school_id,guardian_name,guardian_phone,monthly_fee,start_date) values ('Half','${SCH}','G','0712222222',3000,'2026-11-16')`);
  const a = await one(`select * from generate_monthly_invoices('2026-11-01')`);
  assert.equal(a.created, 2);
  const b = await one(`select * from generate_monthly_invoices('2026-11-20')`);
  assert.deepEqual([b.created, b.skipped], [0, 2]);
  assert.equal((await one(`select i.monthly_fee from invoices i join students s on s.id = i.student_id where s.full_name='Half'`)).monthly_fee, '1500.00');
});

test('payments: partial, overpay blocked, status follows the payments', async () => {
  const inv = (await one(`select id from invoices where monthly_fee = 5000`)).id;
  await db.exec(`insert into payments(reference,amount,category,invoice_id) values ('',2000,'other','${inv}')`);
  assert.deepEqual(await one(`select amount_paid, balance from invoices where id='${inv}'`), { amount_paid: '2000.00', balance: '3000.00' });
  await rejects(`insert into payments(reference,amount,category,invoice_id) values ('',9000,'other','${inv}')`, /exceeds invoice balance/);
  const p = await one(`select category, student_id from payments`);
  assert.equal(p.category, 'school_transport');            // category/student are derived on the server, not trusted from the client
  assert.equal(p.student_id, STU);
  assert.equal((await one(`select vehicle_id from payments`)).vehicle_id, BUS); // school fees count towards the student's vehicle
});

test('payment idempotency key stops a double-submit', async () => {
  const inv = (await one(`select id from invoices where monthly_fee = 1500`)).id;
  const k = '99999999-9999-9999-9999-999999999999';
  await db.exec(`insert into payments(reference,amount,category,invoice_id,idempotency_key) values ('',500,'other','${inv}','${k}')`);
  await rejects(`insert into payments(reference,amount,category,invoice_id,idempotency_key) values ('',500,'other','${inv}','${k}')`, /uq_payments_idempotency/);
});

test('invoice adjustments need a reason and cannot go below what is paid; advances split correctly', async () => {
  const inv = (await one(`select id from invoices where monthly_fee = 5000`)).id;
  await rejects(`select adjust_invoice('${inv}', 100, 0, '')`, /reason is required/);
  await rejects(`select adjust_invoice('${inv}', 4500, 0, 'too big')`, /below the amount already paid/);
  await db.exec(`select adjust_invoice('${inv}', 500, 0, 'sibling discount')`);
  assert.equal((await one(`select total_payable from invoices where id='${inv}'`)).total_payable, '4500.00');
  await rejects(`select cancel_invoice('${inv}', 'oops')`, /has payments/);
  await db.exec(`insert into payments(reference,amount,category,student_id) values ('',6000,'school_transport','${STU}')`);
  const adv = (await one(`select id from payments where invoice_id is null and booking_id is null`)).id;
  await db.exec(`select apply_advance('${adv}','${inv}')`);
  assert.deepEqual(await one(`select amount_paid, balance, status from invoices where id='${inv}'`), { amount_paid: '4500.00', balance: '0.00', status: 'paid' });
  assert.equal((await one(`select amount from payments where invoice_id is null and booking_id is null`)).amount, '3500.00'); // remainder stays as credit
});

test('bookings: overlapping vehicle/driver/maintenance/school-route/licence conflicts are blocked', async () => {
  await db.exec(booking(BK, BUS, '2026-12-05 09:00+05:30', '2026-12-05 18:00+05:30', 'confirmed'));
  await rejects(booking('60000000-0000-0000-0000-000000000002', BUS, '2026-12-05 12:00+05:30', '2026-12-05 20:00+05:30', 'confirmed'), /already booked/);
  await rejects(booking('60000000-0000-0000-0000-000000000003', BUS, '2026-12-07 07:00+05:30', '2026-12-07 12:00+05:30', 'confirmed'), /School route/); // Monday run 06:30-08:00
  await db.exec(booking('60000000-0000-0000-0000-000000000004', BUS, '2026-12-07 07:00+05:30', '2026-12-07 12:00+05:30', 'quotation_sent')); // quotes may overlap
  await db.exec(`update vehicles set status='under_maintenance' where id='${VAN}'`);
  await rejects(booking('60000000-0000-0000-0000-000000000005', VAN, '2026-12-09 09:00+05:30', '2026-12-09 12:00+05:30', 'confirmed'), /not available/);
  await db.exec(`update vehicles set status='active' where id='${VAN}'; insert into vehicle_maintenance(vehicle_id,service_date,category,cost,next_service_date) values ('${VAN}','2026-11-01','oil_change',0,'2026-12-10')`);
  await rejects(booking('60000000-0000-0000-0000-000000000006', VAN, '2026-12-10 09:00+05:30', '2026-12-10 12:00+05:30', 'confirmed'), /Maintenance scheduled/);
  await rejects(booking('60000000-0000-0000-0000-000000000007', VAN, '2026-12-20 09:00+05:30', '2026-12-20 12:00+05:30', 'confirmed', 'assigned_driver_id,arrangement', `'${DRV}','external_driver'`), /licence expires/);
  await rejects(booking('60000000-0000-0000-0000-000000000008', VAN, '2027-01-05 12:00+05:30', '2027-01-05 10:00+05:30', 'inquiry'), /hire_bookings_check/);
});

test('booking payments: category and vehicle derived, overpay blocked; driver pay creates one locked expense', async () => {
  await db.exec(`insert into payments(reference,amount,category,booking_id) values ('',4000,'other','${BK}')`);
  assert.deepEqual(await one(`select category, vehicle_id from payments where booking_id='${BK}'`), { category: 'bus_hire', vehicle_id: BUS });
  await rejects(`insert into payments(reference,amount,category,booking_id) values ('',7000,'other','${BK}')`, /exceeds booking balance/);
  await db.exec(`insert into booking_driver_assignments(booking_id,driver_id,agreed_fee) values ('${BK}','${DRV}',3000)`);
  const a = (await one(`select id from booking_driver_assignments`)).id;
  await db.exec(`select pay_driver('${a}',1000,'cash'); select pay_driver('${a}',2000,'cash')`);
  await rejects(`select pay_driver('${a}',1,'cash')`, /exceeds the agreed driver fee/);
  assert.equal((await one(`select payment_status from booking_driver_assignments`)).payment_status, 'paid');
  const e = await one(`select count(*)::int n, sum(amount) total from expenses where source='driver_payment'`);
  assert.deepEqual([e.n, e.total], [2, '3000.00']);
  await rejects(`update expenses set amount = 1 where source='driver_payment'`, /created automatically/);
});

test('fuel and maintenance each keep exactly one linked, locked expense', async () => {
  await db.exec(`insert into fuel_records(id,vehicle_id,fuel_date,fuel_type,litres,total_cost,odometer_km) values ('80000000-0000-0000-0000-000000000001','${BUS}','2026-11-10','diesel',30,9000,500)`);
  await db.exec(`update fuel_records set total_cost = 9500`);
  assert.deepEqual(await one(`select count(*)::int n, sum(amount) t from expenses where source='fuel'`), { n: 1, t: '9500.00' });
  await rejects(`delete from expenses where source='fuel'`, /created automatically/);
  await rejects(`insert into fuel_records(vehicle_id,fuel_date,fuel_type,litres,total_cost) values ('${BUS}','2026-11-11','diesel',5,0)`, /total_cost_check/);
  assert.equal((await one(`select odometer_km from vehicles where id='${BUS}'`)).odometer_km, '500.0');
  await db.exec(`delete from fuel_records`);
  assert.equal((await one(`select count(*)::int n from expenses where source='fuel'`)).n, 0);
  await db.exec(`insert into vehicle_maintenance(id,vehicle_id,service_date,category,cost,odometer_km) values ('70000000-0000-0000-0000-000000000001','${BUS}','2026-11-05','oil_change',4500,800)`);
  assert.equal((await one(`select count(*)::int n from expenses where source='maintenance'`)).n, 1);
  await db.exec(`update vehicle_maintenance set cost = 0`);
  assert.equal((await one(`select count(*)::int n from expenses where source='maintenance'`)).n, 0);
  const cat = (await one(`select id from expense_categories where name='Parking'`)).id;
  await db.exec(`insert into expenses(category_id,description,amount) values ('${cat}','Parking',200); update expenses set amount = 250 where source='manual'; delete from expenses where source='manual'`); // manual ones stay editable
});

test('a newer insurance document updates the vehicle expiry and an older one never lowers it', async () => {
  await db.exec(`insert into vehicle_documents(vehicle_id,doc_type,title,expiry_date) values ('${BUS}','insurance','New','2027-01-01'),('${BUS}','insurance','Old','2026-01-01')`);
  assert.equal((await one(`select insurance_expiry::text d from vehicles where id='${BUS}'`)).d, '2027-01-01');
});

test('inquiry conversion creates/reuses the customer once', async () => {
  await db.exec(`select submit_inquiry('Bob','077 123 4567',null,'Bus hire',null,'A','B','2026-12-30',20,'any','hello')`);
  const iq = (await one(`select id from public_inquiries`)).id;
  await db.exec(`select convert_inquiry_to_booking('${iq}','${VAN}','2026-12-30 09:00+05:30','2026-12-30 17:00+05:30',15000)`);
  assert.equal((await one(`select count(*)::int n from customers`)).n, 1);          // matched the existing phone, no duplicate
  assert.equal((await one(`select status from public_inquiries`)).status, 'converted');
  await rejects(`select convert_inquiry_to_booking('${iq}','${VAN}','2026-12-31 09:00+05:30','2026-12-31 17:00+05:30',1)`, /already converted/);
});

test('public inquiry form validates input and is rate limited', async () => {
  const call = (name, phone, svc = 'Bus hire') => `select submit_inquiry('${name}','${phone}',null,'${svc}',null,null,null,null,null,null,null)`;
  await rejects(call('', '0771234567'), /Name is required/);
  await rejects(call('Sam', 'abc'), /valid phone/);
  for (let i = 0; i < 5; i++) await db.exec(call('Spam', '0779999999'));
  await rejects(call('Spam', '0779999999'), /Too many requests/);              // per phone
  for (let i = 0; i < 60; i++) await db.exec(`insert into public_inquiries(customer_name,phone,service) values ('Bot','07700000${String(i).padStart(2, '0')}','x')`);
  await rejects(call('Another', '0778888888'), /lot of requests/);              // overall cap (0005)
});

test('dashboard and report figures reconcile with the recorded transactions', async () => {
  const s = (await one(`select dashboard_summary(date '2026-01-01', current_date + 1) r`)).r;
  const inc = Number((await one(`select coalesce(sum(amount),0) t from payments`)).t), exp = Number((await one(`select coalesce(sum(amount),0) t from expenses`)).t);
  assert.equal(s.income, inc); assert.equal(s.expenses, exp); assert.equal(s.net, inc - exp);
  const vs = await rows(`select * from rpt_vehicle_summary(date '2026-01-01', current_date + 1)`);
  assert.equal(vs.reduce((a, r) => a + Number(r.revenue), 0), inc);              // no income lost or double counted per vehicle
  assert.equal(vs.reduce((a, r) => a + Number(r.expenses), 0), exp);
  const m = await rows(`select * from rpt_cash_matrix('income','month', date '2026-01-01', current_date + 1)`);
  assert.equal(m.reduce((a, r) => a + Number(r.total), 0), inc);
});

test('notifications are generated once, not on every run', async () => {
  const first = (await one(`select generate_notifications() n`)).n;
  assert.ok(first > 0);
  assert.equal((await one(`select generate_notifications() n`)).n, 0);
});

test('row level security: the public sees only published content and cannot call admin functions', async () => {
  await db.exec(`set request.uid=''; set role anon`);
  assert.ok((await one(`select count(*)::int n from services`)).n > 0);
  for (const t of ['vehicles', 'students', 'payments', 'expenses', 'public_inquiries', 'audit_logs', 'profiles'])
    await assert.rejects(() => db.query(`select * from ${t}`), /permission denied/, t);
  const pv = await rows(`select * from public_vehicles limit 1`);
  assert.ok(pv.length === 0 || !('registration_number' in pv[0]));
  for (const f of ['dashboard_summary(current_date,current_date)', 'generate_notifications()', 'mark_overdue_invoices()'])
    await assert.rejects(() => db.query(`select ${f}`), /permission denied/, f);
  await asAdmin();
});
