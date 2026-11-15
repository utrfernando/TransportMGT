-- =====================================================================
-- Transport Business Management System — schema, RLS, functions, seed
-- Run once in the Supabase SQL editor of a NEW (empty) project.
-- =====================================================================
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type app_role as enum ('OWNER', 'ADMIN');
create type vehicle_type as enum ('bus', 'van', 'three_wheeler', 'other');
create type vehicle_status as enum ('active', 'under_maintenance', 'unavailable', 'inactive');
create type fuel_type as enum ('petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other');
create type driver_status as enum ('active', 'inactive', 'on_leave');
create type customer_category as enum ('individual', 'school', 'corporate', 'other');
create type student_status as enum ('active', 'paused', 'completed', 'withdrawn');
create type school_status as enum ('active', 'inactive');
create type route_status as enum ('active', 'inactive');
create type invoice_status as enum ('unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled');
create type hire_type as enum ('bus_hire', 'van_hire', 'tuk_tuk_hire', 'private', 'other');
create type driver_arrangement as enum ('owner_drives', 'external_driver', 'vehicle_only');
create type booking_status as enum ('inquiry', 'quotation_sent', 'confirmed', 'in_progress', 'completed', 'cancelled');
create type payment_method as enum ('cash', 'bank_transfer', 'card', 'other');
create type income_category as enum ('school_transport', 'bus_hire', 'van_hire', 'tuk_tuk_hire', 'other');
create type driver_payment_status as enum ('unpaid', 'partially_paid', 'paid');
create type maintenance_type as enum ('oil_change', 'engine_repair', 'tyre_replacement', 'battery_replacement', 'general_service', 'electrical_repair', 'other');
create type document_type as enum ('insurance', 'revenue_licence', 'emission_certificate', 'registration', 'service_invoice', 'agreement', 'other');
create type renewal_status as enum ('valid', 'due_soon', 'expired', 'renewed');
create type inquiry_status as enum ('new', 'contacted', 'quotation_sent', 'converted', 'closed');

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------
-- profiles (linked to auth.users; no passwords stored here)
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  role app_role not null default 'ADMIN',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles for each row execute function set_updated_at();

-- Authorization helpers (security definer so RLS on profiles cannot recurse)
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active);
$$;
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active and role = 'OWNER');
$$;
revoke all on function is_admin(), is_owner() from public;
grant execute on function is_admin(), is_owner() to authenticated, anon;

-- ---------------------------------------------------------------------
-- business_settings (single row)
-- ---------------------------------------------------------------------
create table business_settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Transport Business',
  tagline text not null default 'Safe, reliable transport you can trust',
  logo_url text,
  address text,
  phone text,
  whatsapp text,
  email text,
  maps_url text,
  social jsonb not null default '{}'::jsonb,
  about_text text,
  mission text,
  vision text,
  currency text not null default 'LKR',
  timezone text not null default 'Asia/Colombo',
  invoice_prefix text not null default 'INV',
  receipt_prefix text not null default 'RCP',
  default_due_days int not null default 10 check (default_due_days between 0 and 90),
  billing_rules jsonb not null default '{"partial_month":"prorate_by_days","bill_on_day":1}'::jsonb,
  booking_terms text,
  notification_prefs jsonb not null default '{"document_expiry_days":30,"service_reminder_days":14,"booking_reminder_days":2}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger trg_settings_updated before update on business_settings for each row execute function set_updated_at();
insert into business_settings (id, business_name, about_text, mission, vision, booking_terms) values (
  1, 'Transport Business',
  'We provide safe, punctual and affordable transport for schoolchildren and for private hires across the region.',
  'To move people safely, on time and with courtesy, every single trip.',
  'To be the most trusted local transport partner for families, schools and businesses.',
  'A confirmed booking requires an advance payment. Cancellations are subject to the agreed terms. Vehicle-only hire is subject to the operator''s policies, insurance and legal requirements.'
);

-- Public-safe subset of settings (no billing rules, no internal prefs)
create or replace function get_public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business_name', business_name, 'tagline', tagline, 'logo_url', logo_url,
    'address', address, 'phone', phone, 'whatsapp', whatsapp, 'email', email,
    'maps_url', maps_url, 'social', social, 'about_text', about_text,
    'mission', mission, 'vision', vision, 'currency', currency)
  from business_settings where id = 1;
$$;
grant execute on function get_public_settings() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Website content
-- ---------------------------------------------------------------------
create table website_content (
  key text primary key,
  title text,
  body text,
  data jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger trg_wc_updated before update on website_content for each row execute function set_updated_at();

create table services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null,
  description text,
  icon text not null default 'bus',
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_services_updated before update on services for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Fleet
-- ---------------------------------------------------------------------
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vehicle_type vehicle_type not null,
  registration_number text not null,
  brand text,
  model text,
  manufacturing_year int check (manufacturing_year between 1950 and 2100),
  seating_capacity int not null check (seating_capacity > 0),
  fuel_type fuel_type not null default 'diesel',
  fuel_tank_capacity numeric(8,2) check (fuel_tank_capacity > 0),
  odometer_km numeric(10,1) not null default 0 check (odometer_km >= 0),
  ownership_info text,
  photo_paths text[] not null default '{}',
  insurance_expiry date,
  revenue_licence_expiry date,
  emission_expiry date,
  status vehicle_status not null default 'active',
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_vehicles_reg on vehicles (upper(registration_number)) where not is_archived;
create trigger trg_vehicles_updated before update on vehicles for each row execute function set_updated_at();

create table public_vehicle_listings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null unique references vehicles(id) on delete cascade,
  title text not null,
  description text,
  specs text,
  image_url text,
  hire_info text,
  sort_order int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_pvl_updated before update on public_vehicle_listings for each row execute function set_updated_at();

-- Public view: listing + only safe vehicle columns (no registration, no notes)
create or replace view public_vehicles with (security_invoker = false) as
  select l.id, l.title, l.description, l.specs, l.image_url, l.hire_info, l.sort_order,
         v.vehicle_type, v.seating_capacity, v.fuel_type
  from public_vehicle_listings l join vehicles v on v.id = l.vehicle_id
  where l.is_published and not v.is_archived and v.status <> 'inactive';
grant select on public_vehicles to anon, authenticated;

create table drivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  address text,
  licence_number text,
  licence_expiry date,
  emergency_contact text,
  assigned_vehicle_id uuid references vehicles(id) on delete set null,
  is_owner boolean not null default false,
  status driver_status not null default 'active',
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_driver_licence on drivers (licence_number) where licence_number is not null and not is_archived;
create trigger trg_drivers_updated before update on drivers for each row execute function set_updated_at();

create table vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete restrict,
  doc_type document_type not null,
  title text not null,
  file_path text,
  issue_date date,
  expiry_date date,
  renewal_status renewal_status not null default 'valid',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date)
);
create index on vehicle_documents (vehicle_id);
create index on vehicle_documents (expiry_date);
create trigger trg_vdocs_updated before update on vehicle_documents for each row execute function set_updated_at();

create table vehicle_maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete restrict,
  service_date date not null,
  category maintenance_type not null,
  description text,
  service_provider text,
  cost numeric(12,2) not null default 0 check (cost >= 0),
  odometer_km numeric(10,1),
  next_service_date date,
  next_service_odometer_km numeric(10,1),
  receipt_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on vehicle_maintenance (vehicle_id, service_date);
create trigger trg_vmaint_updated before update on vehicle_maintenance for each row execute function set_updated_at();

create table fuel_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete restrict,
  fuel_date date not null,
  fuel_type fuel_type not null,
  litres numeric(8,2) not null check (litres > 0),
  total_cost numeric(12,2) not null check (total_cost >= 0),
  odometer_km numeric(10,1),
  fuel_station text,
  receipt_path text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on fuel_records (vehicle_id, fuel_date);
create trigger trg_fuel_updated before update on fuel_records for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  address text,
  category customer_category not null default 'individual',
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- prevent duplicate customers sharing the same contact number
create unique index uq_customers_phone on customers (regexp_replace(phone, '\D', '', 'g')) where not is_archived;
create trigger trg_customers_updated before update on customers for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Schools, students, routes
-- ---------------------------------------------------------------------
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  contact_person text,
  contact_phone text,
  email text,
  agreement_details text,
  start_date date,
  status school_status not null default 'active',
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_schools_updated before update on schools for each row execute function set_updated_at();

create table school_contracts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete restrict,
  title text not null,
  details text,
  start_date date not null,
  end_date date,
  file_path text,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table transport_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school_id uuid references schools(id) on delete restrict,
  vehicle_id uuid references vehicles(id) on delete restrict,
  driver_id uuid references drivers(id) on delete restrict,
  operating_days smallint[] not null default '{1,2,3,4,5}', -- 0=Sun..6=Sat
  departure_time time not null,
  return_time time not null,
  status route_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_routes_updated before update on transport_routes for each row execute function set_updated_at();

create table route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references transport_routes(id) on delete cascade,
  stop_type text not null check (stop_type in ('pickup', 'dropoff')),
  name text not null,
  sequence int not null default 0,
  scheduled_time time
);
create index on route_stops (route_id, sequence);

create sequence student_seq;
create table students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique default ('STU-' || lpad(nextval('student_seq')::text, 5, '0')),
  full_name text not null,
  school_id uuid not null references schools(id) on delete restrict,
  guardian_name text not null,
  guardian_phone text not null,
  secondary_contact text,
  pickup_location text,
  dropoff_location text,
  vehicle_id uuid references vehicles(id) on delete set null,
  monthly_fee numeric(12,2) not null default 0 check (monthly_fee >= 0),
  start_date date not null default current_date,
  end_date date,
  status student_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index on students (school_id);
create index on students (status);
create trigger trg_students_updated before update on students for each row execute function set_updated_at();

-- history-preserving route assignment
create table student_route_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  route_id uuid not null references transport_routes(id) on delete restrict,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  exclude using gist (student_id with =, daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&)
);
create index on student_route_assignments (route_id);

-- ---------------------------------------------------------------------
-- Hire bookings
-- ---------------------------------------------------------------------
create sequence booking_seq;
create table hire_bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('BK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('booking_seq')::text, 5, '0')),
  customer_id uuid not null references customers(id) on delete restrict,
  vehicle_id uuid not null references vehicles(id) on delete restrict,
  hire_type hire_type not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  pickup_location text,
  destination text,
  return_location text,
  passenger_count int check (passenger_count > 0),
  distance_km numeric(8,1) check (distance_km >= 0),
  agreed_price numeric(12,2) not null default 0 check (agreed_price >= 0),
  advance_amount numeric(12,2) not null default 0 check (advance_amount >= 0),
  fuel_cost numeric(12,2) not null default 0 check (fuel_cost >= 0),
  other_expenses numeric(12,2) not null default 0 check (other_expenses >= 0),
  arrangement driver_arrangement not null default 'owner_drives',
  assigned_driver_id uuid references drivers(id) on delete restrict,
  status booking_status not null default 'inquiry',
  inquiry_id uuid,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (arrangement <> 'external_driver' or assigned_driver_id is not null),
  -- no two active bookings for one vehicle may overlap
  constraint no_vehicle_overlap exclude using gist (vehicle_id with =, tstzrange(start_at, end_at) with &&)
    where (status in ('confirmed', 'in_progress')),
  -- nor for one driver
  constraint no_driver_overlap exclude using gist (assigned_driver_id with =, tstzrange(start_at, end_at) with &&)
    where (status in ('confirmed', 'in_progress') and assigned_driver_id is not null)
);
create index on hire_bookings (customer_id);
create index on hire_bookings (vehicle_id, start_at);
create trigger trg_bookings_updated before update on hire_bookings for each row execute function set_updated_at();

create table booking_driver_assignments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references hire_bookings(id) on delete restrict,
  driver_id uuid not null references drivers(id) on delete restrict,
  agreed_fee numeric(12,2) not null default 0 check (agreed_fee >= 0),
  advance_paid numeric(12,2) not null default 0 check (advance_paid >= 0),
  payment_status driver_payment_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (advance_paid <= agreed_fee)
);
create trigger trg_bda_updated before update on booking_driver_assignments for each row execute function set_updated_at();

create table booking_expenses (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references hire_bookings(id) on delete restrict,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_system boolean not null default false,
  sort_order int not null default 0
);

create sequence invoice_seq;
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  student_id uuid not null references students(id) on delete restrict,
  school_id uuid not null references schools(id) on delete restrict,
  billing_month date not null check (billing_month = date_trunc('month', billing_month)::date),
  monthly_fee numeric(12,2) not null check (monthly_fee >= 0),
  previous_balance numeric(12,2) not null default 0,  -- informational carry-forward; NOT included in total_payable
  discount numeric(12,2) not null default 0 check (discount >= 0),
  adjustment numeric(12,2) not null default 0,
  total_payable numeric(12,2) generated always as (monthly_fee - discount + adjustment) stored,
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  balance numeric(12,2) generated always as (monthly_fee - discount + adjustment - amount_paid) stored,
  status invoice_status not null default 'unpaid',
  due_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_invoice_student_month unique (student_id, billing_month)   -- idempotent billing
);
create index on invoices (school_id, billing_month);
create index on invoices (status);
create trigger trg_invoices_updated before update on invoices for each row execute function set_updated_at();

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null
);

create table school_invoices (   -- monthly per-school billing statement
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete restrict,
  billing_month date not null,
  student_count int not null default 0,
  total_invoiced numeric(12,2) not null default 0,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id),
  unique (school_id, billing_month)
);

create sequence receipt_seq;
create table payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,             -- receipt number; duplicates impossible
  payment_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  method payment_method not null default 'cash',
  category income_category not null,
  invoice_id uuid references invoices(id) on delete restrict,
  booking_id uuid references hire_bookings(id) on delete restrict,
  student_id uuid references students(id) on delete restrict,   -- advance payments w/o invoice
  vehicle_id uuid references vehicles(id) on delete set null,
  notes text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (not (invoice_id is not null and booking_id is not null))
);
create index on payments (payment_date);
create index on payments (invoice_id);
create index on payments (booking_id);

create sequence expense_seq;
create table expenses (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('EXP-' || lpad(nextval('expense_seq')::text, 6, '0')),
  expense_date date not null default current_date,
  category_id uuid not null references expense_categories(id) on delete restrict,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  vehicle_id uuid references vehicles(id) on delete restrict,
  booking_id uuid references hire_bookings(id) on delete restrict,
  payment_method payment_method not null default 'cash',
  supplier text,
  receipt_path text,
  notes text,
  fuel_record_id uuid unique references fuel_records(id) on delete cascade,        -- linked, never duplicated
  maintenance_id uuid unique references vehicle_maintenance(id) on delete cascade,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on expenses (expense_date);
create index on expenses (vehicle_id);
create trigger trg_expenses_updated before update on expenses for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Inquiries, notifications, audit
-- ---------------------------------------------------------------------
create sequence inquiry_seq;
create table public_inquiries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('INQ-' || lpad(nextval('inquiry_seq')::text, 5, '0')),
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  phone text not null check (char_length(phone) between 7 and 20),
  email text check (email is null or char_length(email) <= 200),
  service text not null check (char_length(service) <= 80),
  preferred_vehicle text check (char_length(preferred_vehicle) <= 120),
  pickup_location text check (char_length(pickup_location) <= 300),
  destination text check (char_length(destination) <= 300),
  travel_date date,
  passenger_count int check (passenger_count between 1 and 200),
  driver_requirement text check (driver_requirement in ('owner_drives', 'external_driver', 'vehicle_only', 'any')),
  message text check (char_length(message) <= 2000),
  status inquiry_status not null default 'new',
  admin_notes text,
  converted_booking_id uuid references hire_bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public_inquiries (status, created_at desc);
create trigger trg_inq_updated before update on public_inquiries for each row execute function set_updated_at();

create table notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text unique,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on notifications (is_read, created_at desc);

create table audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index on audit_logs (table_name, created_at desc);

create or replace function log_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare rid text;
begin
  rid := coalesce((to_jsonb(coalesce(new, old))->>'id'), '');
  insert into audit_logs (user_id, table_name, record_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name, rid, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','business_settings','vehicles','drivers','vehicle_documents','vehicle_maintenance','fuel_records',
    'customers','schools','students','transport_routes','student_route_assignments','hire_bookings','booking_driver_assignments',
    'invoices','payments','expenses','public_vehicle_listings','services','website_content']
  loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$I for each row execute function log_audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Financial business logic
-- ---------------------------------------------------------------------
-- Recalculate an invoice's paid amount/status from its payments (single source of truth)
create or replace function recalc_invoice(p_invoice uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_paid numeric(12,2); v_total numeric(12,2); v_due date; v_status invoice_status; v_cur invoice_status;
begin
  select status, total_payable, due_date into v_cur, v_total, v_due from invoices where id = p_invoice for update;
  if not found or v_cur = 'cancelled' then return; end if;
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = p_invoice;
  v_status := case
    when v_paid >= v_total and v_total > 0 then 'paid'
    when v_total = 0 then 'paid'
    when v_paid > 0 then 'partially_paid'
    else 'unpaid' end;
  if v_status <> 'paid' and v_due < current_date then v_status := 'overdue'; end if;
  update invoices set amount_paid = v_paid, status = v_status where id = p_invoice;
end $$;

create or replace function trg_payment_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.invoice_id is not null then perform recalc_invoice(old.invoice_id); end if;
  if tg_op in ('INSERT','UPDATE') and new.invoice_id is not null then perform recalc_invoice(new.invoice_id); end if;
  return coalesce(new, old);
end $$;
create trigger trg_payments_sync after insert or update or delete on payments for each row execute function trg_payment_sync();

-- Never allow paying more than is owed on an invoice / booking
create or replace function trg_payment_validate() returns trigger language plpgsql security definer set search_path = public as $$
declare v_owed numeric; v_paid numeric;
begin
  if new.reference is null or new.reference = '' then
    new.reference := (select receipt_prefix from business_settings where id = 1) || '-' || to_char(new.payment_date, 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 6, '0');
  end if;
  new.recorded_by := coalesce(new.recorded_by, auth.uid());
  if new.invoice_id is not null then
    select total_payable into v_owed from invoices where id = new.invoice_id;
    select coalesce(sum(amount),0) into v_paid from payments where invoice_id = new.invoice_id and id is distinct from new.id;
    if v_paid + new.amount > v_owed then raise exception 'Payment exceeds invoice balance (balance: %)', v_owed - v_paid; end if;
  elsif new.booking_id is not null then
    select agreed_price into v_owed from hire_bookings where id = new.booking_id;
    select coalesce(sum(amount),0) into v_paid from payments where booking_id = new.booking_id and id is distinct from new.id;
    if v_paid + new.amount > v_owed then raise exception 'Payment exceeds booking balance (balance: %)', v_owed - v_paid; end if;
  end if;
  return new;
end $$;
create trigger trg_payments_validate before insert or update on payments for each row execute function trg_payment_validate();

-- Overdue sweep (call from dashboard load or pg_cron)
create or replace function mark_overdue_invoices() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  update invoices set status = 'overdue' where status in ('unpaid','partially_paid') and due_date < current_date and balance > 0;
  get diagnostics n = row_count; return n;
end $$;

-- Idempotent monthly billing. Safe to run repeatedly for the same month.
create or replace function generate_monthly_invoices(p_month date) returns table (created int, skipped int)
language plpgsql security definer set search_path = public as $$
declare
  m date := date_trunc('month', p_month)::date;
  m_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  rule text; due_days int; s record; fee numeric(12,2); n_created int := 0; n_skipped int := 0; days_in int; active_days int;
  inv_id uuid; prev numeric(12,2); inv_no text; pref text;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select billing_rules->>'partial_month', default_due_days, invoice_prefix into rule, due_days, pref from business_settings where id = 1;
  for s in
    select st.* from students st
    where st.status in ('active') and st.start_date <= m_end and (st.end_date is null or st.end_date >= m)
  loop
    if exists (select 1 from invoices where student_id = s.id and billing_month = m) then n_skipped := n_skipped + 1; continue; end if;
    fee := s.monthly_fee;
    if rule = 'prorate_by_days' and (s.start_date > m or (s.end_date is not null and s.end_date < m_end)) then
      days_in := (m_end - m) + 1;
      active_days := (least(m_end, coalesce(s.end_date, m_end)) - greatest(m, s.start_date)) + 1;
      fee := round(s.monthly_fee * active_days / days_in, 2);
    end if;
    select coalesce(sum(balance), 0) into prev from invoices where student_id = s.id and billing_month < m and status <> 'cancelled';
    inv_no := pref || '-' || to_char(m, 'YYYYMM') || '-' || lpad(nextval('invoice_seq')::text, 5, '0');
    insert into invoices (invoice_number, student_id, school_id, billing_month, monthly_fee, previous_balance, due_date)
    values (inv_no, s.id, s.school_id, m, fee, prev, m + due_days)
    on conflict (student_id, billing_month) do nothing
    returning id into inv_id;
    if inv_id is null then n_skipped := n_skipped + 1; else
      insert into invoice_items (invoice_id, description, amount) values (inv_id, 'School transport — ' || to_char(m, 'Mon YYYY'), fee);
      n_created := n_created + 1;
    end if;
    inv_id := null;
  end loop;
  insert into school_invoices (school_id, billing_month, student_count, total_invoiced, generated_by)
  select school_id, m, count(*), sum(total_payable), auth.uid() from invoices where billing_month = m group by school_id
  on conflict (school_id, billing_month) do update set student_count = excluded.student_count, total_invoiced = excluded.total_invoiced;
  return query select n_created, n_skipped;
end $$;
revoke all on function generate_monthly_invoices(date), mark_overdue_invoices() from public, anon;
grant execute on function generate_monthly_invoices(date), mark_overdue_invoices() to authenticated;

-- Fuel / maintenance create ONE linked expense (unique FK prevents duplicates)
create or replace function trg_fuel_expense() returns trigger language plpgsql security definer set search_path = public as $$
declare cat uuid;
begin
  select id into cat from expense_categories where name = 'Fuel';
  if tg_op = 'INSERT' then
    insert into expenses (expense_date, category_id, description, amount, vehicle_id, supplier, receipt_path, fuel_record_id, recorded_by)
    values (new.fuel_date, cat, 'Fuel — ' || new.litres || ' L', new.total_cost, new.vehicle_id, new.fuel_station, new.receipt_path, new.id, new.created_by);
  else
    update expenses set expense_date = new.fuel_date, amount = new.total_cost, vehicle_id = new.vehicle_id, supplier = new.fuel_station,
      receipt_path = new.receipt_path, description = 'Fuel — ' || new.litres || ' L' where fuel_record_id = new.id;
  end if;
  return new;
end $$;
create trigger trg_fuel_exp_ai after insert on fuel_records for each row when (new.total_cost > 0) execute function trg_fuel_expense();
create trigger trg_fuel_exp_au after update on fuel_records for each row when (new.total_cost > 0) execute function trg_fuel_expense();

create or replace function trg_maint_expense() returns trigger language plpgsql security definer set search_path = public as $$
declare cat uuid;
begin
  select id into cat from expense_categories where name = 'Maintenance';
  if tg_op = 'INSERT' then
    insert into expenses (expense_date, category_id, description, amount, vehicle_id, supplier, receipt_path, maintenance_id, recorded_by)
    values (new.service_date, cat, coalesce(new.description, new.category::text), new.cost, new.vehicle_id, new.service_provider, new.receipt_path, new.id, new.created_by);
  else
    update expenses set expense_date = new.service_date, amount = new.cost, vehicle_id = new.vehicle_id, supplier = new.service_provider,
      receipt_path = new.receipt_path, description = coalesce(new.description, new.category::text) where maintenance_id = new.id;
  end if;
  return new;
end $$;
create trigger trg_maint_exp_ai after insert on vehicle_maintenance for each row when (new.cost > 0) execute function trg_maint_expense();
create trigger trg_maint_exp_au after update on vehicle_maintenance for each row when (new.cost > 0) execute function trg_maint_expense();

-- ---------------------------------------------------------------------
-- Public inquiry submission (validated, controlled access — no direct table insert for anon)
-- ---------------------------------------------------------------------
create or replace function submit_inquiry(
  p_name text, p_phone text, p_email text, p_service text, p_vehicle text, p_pickup text,
  p_destination text, p_travel_date date, p_passengers int, p_driver text, p_message text
) returns text language plpgsql security definer set search_path = public as $$
declare ref text; recent int;
begin
  if char_length(trim(coalesce(p_name,''))) < 2 then raise exception 'Name is required'; end if;
  if p_phone !~ '^[0-9+()\-\s]{7,20}$' then raise exception 'Enter a valid phone number'; end if;
  if p_email is not null and p_email <> '' and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  if p_travel_date is not null and p_travel_date < current_date - 1 then raise exception 'Travel date is in the past'; end if;
  -- basic abuse guard: max 5 inquiries per phone per hour
  select count(*) into recent from public_inquiries where phone = p_phone and created_at > now() - interval '1 hour';
  if recent >= 5 then raise exception 'Too many requests. Please call us instead.'; end if;
  insert into public_inquiries (customer_name, phone, email, service, preferred_vehicle, pickup_location, destination, travel_date, passenger_count, driver_requirement, message)
  values (trim(p_name), trim(p_phone), nullif(trim(coalesce(p_email,'')), ''), p_service, nullif(p_vehicle,''), nullif(p_pickup,''), nullif(p_destination,''), p_travel_date, p_passengers, nullif(p_driver,''), nullif(p_message,''))
  returning reference into ref;
  insert into notifications (kind, title, body, link, dedupe_key)
  values ('inquiry', 'New inquiry ' || ref, p_name || ' — ' || p_service, '/admin/inquiries', 'inq:' || ref);
  return ref;
end $$;
grant execute on function submit_inquiry(text,text,text,text,text,text,text,date,int,text,text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','business_settings','website_content','services','vehicles','public_vehicle_listings','drivers','vehicle_documents',
    'vehicle_maintenance','fuel_records','customers','schools','school_contracts','transport_routes','route_stops','students','student_route_assignments',
    'hire_bookings','booking_driver_assignments','booking_expenses','expense_categories','invoices','invoice_items','school_invoices','payments',
    'expenses','public_inquiries','notifications','audit_logs']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Full access for admins on operational tables
do $$
declare t text;
begin
  foreach t in array array['business_settings','vehicles','drivers','vehicle_documents','vehicle_maintenance','fuel_records','customers','schools',
    'school_contracts','transport_routes','route_stops','students','student_route_assignments','hire_bookings','booking_driver_assignments',
    'booking_expenses','expense_categories','invoices','invoice_items','school_invoices','payments','expenses','public_inquiries','notifications',
    'public_vehicle_listings','services','website_content']
  loop
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Public (read-only, published content only)
create policy public_read_services on services for select to anon using (is_published);
create policy public_read_content on website_content for select to anon using (is_published);
create policy public_read_listings on public_vehicle_listings for select to anon using (is_published);

-- Profiles: everyone reads own; admins read all; only OWNER manages accounts
create policy profiles_self_read on profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy profiles_owner_insert on profiles for insert to authenticated with check (is_owner());
create policy profiles_owner_update on profiles for update to authenticated using (is_owner()) with check (is_owner());
create policy profiles_owner_delete on profiles for delete to authenticated using (is_owner() and id <> auth.uid());

-- Audit log: admins read; nobody writes directly (trigger only)
create policy audit_admin_read on audit_logs for select to authenticated using (is_admin());

-- Block anon from tables that have no anon policy (belt and braces)
revoke all on all tables in schema public from anon;
grant select on services, website_content, public_vehicle_listings, public_vehicles to anon;
revoke insert, update, delete on audit_logs from authenticated;
grant usage on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public-assets', 'public-assets', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('private-files', 'private-files', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "public assets read" on storage.objects for select using (bucket_id = 'public-assets');
create policy "public assets admin write" on storage.objects for insert to authenticated with check (bucket_id = 'public-assets' and is_admin());
create policy "public assets admin update" on storage.objects for update to authenticated using (bucket_id = 'public-assets' and is_admin());
create policy "public assets admin delete" on storage.objects for delete to authenticated using (bucket_id = 'public-assets' and is_admin());
create policy "private files admin all" on storage.objects for all to authenticated using (bucket_id = 'private-files' and is_admin()) with check (bucket_id = 'private-files' and is_admin());

-- ---------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------
insert into expense_categories (name, is_system, sort_order) values
  ('Fuel',true,1),('Vehicle repairs',true,2),('Maintenance',true,3),('Driver payments',true,4),('Insurance',true,5),
  ('Revenue licence',true,6),('Emission testing',true,7),('Vehicle cleaning',true,8),('Parking',true,9),('Tolls',true,10),
  ('Spare parts',true,11),('Office expenses',true,12),('Other',true,13);

insert into services (slug, title, summary, description, icon, sort_order) values
  ('school-transport','School Transport','Safe, punctual daily transport for schoolchildren on a simple monthly plan.','Reliable morning and afternoon school runs with experienced drivers, fixed routes and a simple monthly fee per student. Contact us to register your child.','graduation-cap',1),
  ('bus-hire','Bus Hire','Spacious bus hire for tours, events, weddings and group travel.','Comfortable bus hire for large groups — tours, weddings, corporate outings and pilgrimages. Quotations are provided for every trip.','bus',2),
  ('van-hire','Van Hire','Flexible van hire for families and small groups.','Ideal for family trips, airport transfers and small group travel, with a courteous driver.','car-front',3),
  ('tuk-tuk-hire','Tuk Tuk Hire','Affordable three-wheeler hire for short trips and local travel.','A fun and economical way to get around locally — perfect for short distances and sightseeing.','bike',4),
  ('private-transport','Private Transport','Door-to-door private hires, planned to your schedule.','Tell us when and where, and we will arrange the right vehicle and driver for you.','map-pinned',5),
  ('driver-provided','Driver-Provided Transport','Every hire can include an experienced, professional driver.','Relax while our owner-driver or an experienced assigned driver takes you safely to your destination.','user-round-check',6),
  ('vehicle-only','Vehicle-Only Hire','Self-drive hire where available and permitted.','Available on request, subject to our policies, valid licence checks, insurance and applicable regulations.','key-round',7);

insert into website_content (key, title, body) values
  ('why_choose_us', 'Why choose us', 'Experienced drivers, well-maintained vehicles and transparent pricing.'),
  ('school_transport_intro', 'School transport you can trust', 'We collect and drop students on fixed, well-planned routes. Fees are billed monthly per student. Student information is kept strictly private.'),
  ('school_service_areas', 'Service areas', 'Contact us to check whether your school or area is covered.');
