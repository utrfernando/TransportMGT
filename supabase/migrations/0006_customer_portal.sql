-- =====================================================================
-- Customer / parent portal
--
-- Parents (or guardians) and hire customers can create their own login and see ONLY their
-- own children's school-transport fees and their own hires. Design rules:
--   * A new sign-up sees nothing. Access is granted only when the business gives the person a
--     one-time ACCESS CODE (created by an admin for specific students / customers) and the
--     person enters it while signed in with a confirmed email address.
--   * Portal users get NO table privileges. Everything they read comes from the portal_*()
--     functions below, which return a fixed, curated set of columns for the records linked to
--     auth.uid() — never notes, expenses, margins, registration numbers or other people's data.
--   * Admin-only tables keep their existing RLS; portal users are not in `profiles`, so
--     is_admin() stays false for them.
-- Run after 0005_hardening.sql.
-- =====================================================================

create table portal_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,                       -- sha256 of the code; the plain code is shown to the admin once
  student_ids uuid[] not null default '{}',
  customer_ids uuid[] not null default '{}',
  label text,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (cardinality(student_ids) + cardinality(customer_ids) > 0)
);

create table portal_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  email text,
  full_name text,
  invite_id uuid references portal_invites(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((student_id is null) <> (customer_id is null)),
  unique (user_id, student_id),
  unique (user_id, customer_id)
);
create index on portal_links (user_id) where revoked_at is null;

create table portal_claim_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index on portal_claim_attempts (user_id, created_at desc);

alter table portal_invites enable row level security;
alter table portal_links enable row level security;
alter table portal_claim_attempts enable row level security;
create policy admin_all on portal_invites for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on portal_links for all to authenticated using (is_admin()) with check (is_admin());
-- portal_claim_attempts: no policies at all = nobody (except the definer functions) can touch it
create trigger trg_audit_portal_links after insert or update or delete on portal_links for each row execute function log_audit();
create trigger trg_audit_portal_invites after insert or update or delete on portal_invites for each row execute function log_audit();
revoke all on portal_invites, portal_links, portal_claim_attempts from anon;

-- ---------------------------------------------------------------------
-- Admin: issue / revoke access
-- ---------------------------------------------------------------------
create or replace function portal_hash(p_code text) returns text language sql immutable as $$
  select encode(sha256(convert_to('portal-access:' || upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
$$;

create or replace function create_portal_invite(p_students uuid[], p_customers uuid[], p_days int default 14, p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- no 0/O/1/I/L
  raw text := ''; code text; i int; bytes bytea;
  s uuid[] := coalesce(p_students, '{}'); c uuid[] := coalesce(p_customers, '{}'); exp timestamptz; n int;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  if cardinality(s) + cardinality(c) = 0 then raise exception 'Choose at least one student or customer'; end if;
  if cardinality(s) + cardinality(c) > 20 then raise exception 'Too many records for one code'; end if;
  if p_days is null or p_days < 1 or p_days > 60 then raise exception 'Validity must be 1 to 60 days'; end if;
  select count(*) into n from students where id = any(s);   if n <> cardinality(s) then raise exception 'A selected student does not exist'; end if;
  select count(*) into n from customers where id = any(c); if n <> cardinality(c) then raise exception 'A selected customer does not exist'; end if;
  bytes := decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex');   -- 32 random bytes
  for i in 0..11 loop raw := raw || substr(alphabet, 1 + (get_byte(bytes, i) % 31), 1); end loop;
  code := substr(raw, 1, 4) || '-' || substr(raw, 5, 4) || '-' || substr(raw, 9, 4);
  exp := now() + make_interval(days => p_days);
  insert into portal_invites (code_hash, student_ids, customer_ids, label, expires_at, created_by)
  values (portal_hash(code), s, c, nullif(trim(coalesce(p_label, '')), ''), exp, auth.uid());
  return jsonb_build_object('code', code, 'expires_at', exp);
end $$;

create or replace function revoke_portal_invite(p_invite uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  update portal_invites set revoked_at = now() where id = p_invite and used_at is null and revoked_at is null;
end $$;

create or replace function revoke_portal_link(p_link uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  update portal_links set revoked_at = now() where id = p_link and revoked_at is null;
end $$;

-- ---------------------------------------------------------------------
-- Portal user: redeem a code
-- ---------------------------------------------------------------------
create or replace function portal_claim_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); u record; inv portal_invites%rowtype; failures int; sid uuid; cid uuid; ns int := 0; nc int := 0; full_name text;
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  select email, email_confirmed_at, raw_user_meta_data into u from auth.users where id = uid;
  if u.email_confirmed_at is null then raise exception 'Please confirm your email address first (check your inbox)'; end if;
  select count(*) into failures from portal_claim_attempts where user_id = uid and not ok and created_at > now() - interval '1 hour';
  if failures >= 5 then raise exception 'Too many wrong codes. Please wait an hour or contact us.'; end if;

  select * into inv from portal_invites where code_hash = portal_hash(p_code) for update;
  if not found or inv.used_at is not null or inv.revoked_at is not null or inv.expires_at < now() then
    -- Return instead of raising: an exception would roll back this very insert and the attempt limit would never count.
    insert into portal_claim_attempts (user_id, ok) values (uid, false);
    return jsonb_build_object('ok', false, 'error', 'That code is not valid, has expired or was already used. Please ask us for a new one.');
  end if;

  full_name := coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1));
  foreach sid in array inv.student_ids loop
    insert into portal_links (user_id, student_id, email, full_name, invite_id) values (uid, sid, u.email, full_name, inv.id)
    on conflict (user_id, student_id) do update set revoked_at = null, invite_id = inv.id;
    ns := ns + 1;
  end loop;
  foreach cid in array inv.customer_ids loop
    insert into portal_links (user_id, customer_id, email, full_name, invite_id) values (uid, cid, u.email, full_name, inv.id)
    on conflict (user_id, customer_id) do update set revoked_at = null, invite_id = inv.id;
    nc := nc + 1;
  end loop;
  update portal_invites set used_at = now(), used_by = uid where id = inv.id;
  insert into portal_claim_attempts (user_id, ok) values (uid, true);
  return jsonb_build_object('ok', true, 'students', ns, 'customers', nc);
end $$;

-- ---------------------------------------------------------------------
-- Portal user: read their own records (curated columns only)
-- ---------------------------------------------------------------------
create or replace function portal_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); res jsonb;
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  select jsonb_build_object(
    'students', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'student_code', s.student_code, 'name', s.full_name, 'status', s.status, 'school', sc.name,
        'monthly_fee', s.monthly_fee, 'pickup_location', s.pickup_location, 'dropoff_location', s.dropoff_location, 'start_date', s.start_date, 'end_date', s.end_date,
        'route', (select jsonb_build_object('name', r.name, 'departure_time', r.departure_time, 'return_time', r.return_time, 'days', r.operating_days,
                   'vehicle', v.name,
                   'stops', coalesce((select jsonb_agg(jsonb_build_object('type', st.stop_type, 'name', st.name, 'time', st.scheduled_time) order by st.sequence) from route_stops st where st.route_id = r.id), '[]'::jsonb))
                  from student_route_assignments a join transport_routes r on r.id = a.route_id left join vehicles v on v.id = r.vehicle_id
                  where a.student_id = s.id and a.end_date is null limit 1),
        'outstanding', coalesce((select sum(i.balance) from invoices i where i.student_id = s.id and i.status <> 'cancelled' and i.balance > 0), 0)
      ) order by s.full_name)
      from portal_links l join students s on s.id = l.student_id join schools sc on sc.id = s.school_id
      where l.user_id = uid and l.revoked_at is null), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.full_name, 'category', c.category) order by c.full_name)
      from portal_links l join customers c on c.id = l.customer_id where l.user_id = uid and l.revoked_at is null), '[]'::jsonb)
  ) into res;
  return res;
end $$;

create or replace function portal_invoices() returns table (
  invoice_id uuid, student_id uuid, student_name text, invoice_number text, billing_month date,
  total_payable numeric, amount_paid numeric, balance numeric, status text, due_date date)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  return query
    select i.id, s.id, s.full_name, i.invoice_number, i.billing_month, i.total_payable, i.amount_paid, i.balance, i.status::text, i.due_date
    from portal_links l join students s on s.id = l.student_id join invoices i on i.student_id = s.id
    where l.user_id = auth.uid() and l.revoked_at is null and i.status <> 'cancelled'
    order by i.billing_month desc, s.full_name;
end $$;

create or replace function portal_payments() returns table (
  payment_id uuid, reference text, payment_date date, amount numeric, method text, kind text, person_name text, for_text text, balance_after numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  return query
    -- school fees (invoice payments and advance credit) for linked students
    select p.id, p.reference, p.payment_date, p.amount, p.method::text,
           case when p.invoice_id is null then 'advance' else 'school' end, s.full_name,
           case when i.id is null then 'Advance payment — school transport'
                else 'School transport — ' || to_char(i.billing_month, 'Mon YYYY') || ' (' || i.invoice_number || ')' end,
           i.balance
    from payments p join portal_links l on l.student_id = p.student_id and l.user_id = auth.uid() and l.revoked_at is null
    join students s on s.id = p.student_id left join invoices i on i.id = p.invoice_id
    where p.booking_id is null
    union all
    -- hire payments for linked customers
    select p.id, p.reference, p.payment_date, p.amount, p.method::text, 'hire', c.full_name,
           replace(b.hire_type::text, '_', ' ') || ' — ' || b.reference,
           b.agreed_price - (select coalesce(sum(x.amount), 0) from payments x where x.booking_id = b.id)
    from payments p join hire_bookings b on b.id = p.booking_id
    join portal_links l on l.customer_id = b.customer_id and l.user_id = auth.uid() and l.revoked_at is null
    join customers c on c.id = b.customer_id
    order by 3 desc, 2 desc;
end $$;

create or replace function portal_bookings() returns table (
  booking_id uuid, reference text, customer_name text, hire_type text, status text, start_at timestamptz, end_at timestamptz,
  pickup_location text, destination text, return_location text, passenger_count int, vehicle_name text, vehicle_type text,
  arrangement text, agreed_price numeric, paid numeric, balance numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  return query
    select b.id, b.reference, c.full_name, b.hire_type::text, b.status::text, b.start_at, b.end_at, b.pickup_location, b.destination, b.return_location,
           b.passenger_count, v.name, v.vehicle_type::text, b.arrangement::text, b.agreed_price,
           coalesce((select sum(p.amount) from payments p where p.booking_id = b.id), 0),
           case when b.status = 'cancelled' then 0 else b.agreed_price - coalesce((select sum(p.amount) from payments p where p.booking_id = b.id), 0) end
    from hire_bookings b join portal_links l on l.customer_id = b.customer_id and l.user_id = auth.uid() and l.revoked_at is null
    join customers c on c.id = b.customer_id join vehicles v on v.id = b.vehicle_id
    order by b.start_at desc;
end $$;

-- Functions: nobody by default, then only signed-in users (anon can never call them)
revoke all on function portal_hash(text), create_portal_invite(uuid[],uuid[],int,text), revoke_portal_invite(uuid), revoke_portal_link(uuid),
  portal_claim_invite(text), portal_overview(), portal_invoices(), portal_payments(), portal_bookings() from public, anon;
grant execute on function create_portal_invite(uuid[],uuid[],int,text), revoke_portal_invite(uuid), revoke_portal_link(uuid),
  portal_claim_invite(text), portal_overview(), portal_invoices(), portal_payments(), portal_bookings() to authenticated;
