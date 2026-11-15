-- =====================================================================
-- Phase 5: dashboard summary, report aggregations, notification generator
-- Run after 0003_finance_upkeep.sql.
-- All figures are computed from recorded transactions (payments, expenses,
-- invoices, bookings) — nothing is hard-coded.
-- =====================================================================

-- ---------------------------------------------------------------------
-- School-fee payments count towards the student's assigned vehicle (vehicle-wise revenue)
-- ---------------------------------------------------------------------
create or replace function trg_payment_vehicle() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_id is null and new.student_id is not null then
    select vehicle_id into new.vehicle_id from students where id = new.student_id;
  end if;
  return new;
end $$;
create trigger trg_payments_vehicle before insert or update on payments for each row execute function trg_payment_vehicle();
update payments p set vehicle_id = s.vehicle_id from students s where p.student_id = s.id and p.vehicle_id is null and s.vehicle_id is not null;

-- ---------------------------------------------------------------------
-- Dashboard
-- ---------------------------------------------------------------------
create or replace function dashboard_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  prefs jsonb; d_doc int; d_srv int; res jsonb;
  inc numeric(14,2); exp numeric(14,2);
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select notification_prefs into prefs from business_settings where id = 1;
  d_doc := coalesce((prefs->>'document_expiry_days')::int, 30);
  d_srv := coalesce((prefs->>'service_reminder_days')::int, 14);
  select coalesce(sum(amount), 0) into inc from payments where payment_date between p_from and p_to;
  select coalesce(sum(amount), 0) into exp from expenses where expense_date between p_from and p_to;

  res := jsonb_build_object(
    'vehicles_total',  (select count(*) from vehicles where not is_archived),
    'vehicles_active', (select count(*) from vehicles where not is_archived and status = 'active'),
    'vehicles_hired_now', (select count(distinct vehicle_id) from hire_bookings where status in ('confirmed','in_progress') and now() between start_at and end_at),
    'students_active', (select count(*) from students where status = 'active'),
    'schools_active',  (select count(*) from schools where not is_archived and status = 'active'),
    'drivers_total',   (select count(*) from drivers where not is_archived),
    'income', inc, 'expenses', exp, 'net', inc - exp,
    'pending_student_payments', (select coalesce(sum(balance), 0) from invoices where status in ('unpaid','partially_paid','overdue')),
    'overdue_student_payments', (select coalesce(sum(balance), 0) from invoices where status = 'overdue'),
    'outstanding_hire_balances', (select coalesce(sum(b.agreed_price - coalesce(p.paid, 0)), 0)
        from hire_bookings b left join (select booking_id, sum(amount) paid from payments where booking_id is not null group by booking_id) p on p.booking_id = b.id
        where b.status in ('confirmed','in_progress','completed') and b.agreed_price - coalesce(p.paid, 0) > 0),
    'upcoming_bookings', (select count(*) from hire_bookings where status = 'confirmed' and start_at between now() and now() + interval '30 days'),
    'upcoming_maintenance', (select count(*) from (
        select distinct on (vehicle_id, category) next_service_date from vehicle_maintenance order by vehicle_id, category, service_date desc) m
        where next_service_date is not null and next_service_date <= current_date + d_srv),
    'upcoming_doc_expiries', (
        (select count(*) from vehicles v, lateral (values (insurance_expiry), (revenue_licence_expiry), (emission_expiry)) x(d) where not v.is_archived and x.d is not null and x.d <= current_date + d_doc)
        + (select count(*) from drivers where not is_archived and status = 'active' and licence_expiry is not null and licence_expiry <= current_date + d_doc))
  );

  res := res || jsonb_build_object(
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
         'income', (select coalesce(sum(amount),0) from payments where date_trunc('month', payment_date) = m),
         'expenses', (select coalesce(sum(amount),0) from expenses where date_trunc('month', expense_date) = m)) order by m)
       from generate_series(date_trunc('month', p_to) - interval '11 months', date_trunc('month', p_to), interval '1 month') m), '[]'::jsonb),
    'by_vehicle', coalesce((select jsonb_agg(x order by (x->>'revenue')::numeric desc) from (
        select jsonb_build_object('name', v.name, 'revenue', coalesce(sum(p.amount),0)) x from vehicles v
        join payments p on p.vehicle_id = v.id and p.payment_date between p_from and p_to group by v.id, v.name) t), '[]'::jsonb),
    'by_service', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'amount', amt) order by amt desc) from (
        select category::text, sum(amount) amt from payments where payment_date between p_from and p_to group by category) t), '[]'::jsonb),
    'expense_categories', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'amount', amt) order by amt desc) from (
        select c.name, sum(e.amount) amt from expenses e join expense_categories c on c.id = e.category_id where e.expense_date between p_from and p_to group by c.name) t), '[]'::jsonb)
  );
  return res;
end $$;

-- ---------------------------------------------------------------------
-- Report aggregations (done in SQL so they are never truncated by API row limits)
-- ---------------------------------------------------------------------
-- cash in / out grouped by day, month or year and by category
create or replace function rpt_cash_matrix(p_kind text, p_group text, p_from date, p_to date)
returns table (period text, category text, entries bigint, total numeric)
language plpgsql stable security definer set search_path = public as $$
declare fmt text;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  fmt := case p_group when 'day' then 'YYYY-MM-DD' when 'month' then 'YYYY-MM' when 'year' then 'YYYY' else null end;
  if fmt is null then raise exception 'group must be day, month or year'; end if;
  if p_kind = 'income' then
    return query select to_char(p.payment_date, fmt), p.category::text, count(*), sum(p.amount) from payments p
      where p.payment_date between p_from and p_to group by 1, 2 order by 1, 2;
  elsif p_kind = 'expense' then
    return query select to_char(e.expense_date, fmt), c.name::text, count(*), sum(e.amount) from expenses e join expense_categories c on c.id = e.category_id
      where e.expense_date between p_from and p_to group by 1, 2 order by 1, 2;
  else raise exception 'kind must be income or expense'; end if;
end $$;

-- per vehicle: cash revenue and expenses (null vehicle = not allocated to a vehicle)
create or replace function rpt_vehicle_summary(p_from date, p_to date)
returns table (vehicle_id uuid, vehicle_name text, revenue numeric, expenses numeric, payments_count bigint, expense_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  return query
    with r as (select p.vehicle_id v, sum(p.amount) amt, count(*) n from payments p where p.payment_date between p_from and p_to group by 1),
         x as (select e.vehicle_id v, sum(e.amount) amt, count(*) n from expenses e where e.expense_date between p_from and p_to group by 1),
         ids as (select v from r union select v from x)
    select ids.v, coalesce(vh.name, 'Not allocated to a vehicle'), coalesce(r.amt, 0), coalesce(x.amt, 0), coalesce(r.n, 0), coalesce(x.n, 0)
    from ids left join r on r.v is not distinct from ids.v left join x on x.v is not distinct from ids.v left join vehicles vh on vh.id = ids.v
    order by 3 desc;
end $$;

-- receivables / liabilities snapshot used by the P&L report
create or replace function rpt_position(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  return jsonb_build_object(
    'student_invoiced', (select coalesce(sum(total_payable), 0) from invoices where status <> 'cancelled' and billing_month between date_trunc('month', p_from)::date and p_to),
    'student_outstanding', (select coalesce(sum(balance), 0) from invoices where status <> 'cancelled' and balance > 0),
    'hire_booked', (select coalesce(sum(agreed_price), 0) from hire_bookings where status in ('confirmed','in_progress','completed') and start_at::date between p_from and p_to),
    'hire_outstanding', (select coalesce(sum(b.agreed_price - coalesce(p.paid, 0)), 0)
        from hire_bookings b left join (select booking_id, sum(amount) paid from payments where booking_id is not null group by booking_id) p on p.booking_id = b.id
        where b.status in ('confirmed','in_progress','completed') and b.agreed_price - coalesce(p.paid, 0) > 0),
    'driver_liabilities', (select coalesce(sum(a.agreed_fee - a.advance_paid), 0) from booking_driver_assignments a join hire_bookings b on b.id = a.booking_id where b.status <> 'cancelled'),
    'advance_credits', (select coalesce(sum(amount), 0) from payments where student_id is not null and invoice_id is null and booking_id is null)
  );
end $$;

-- ---------------------------------------------------------------------
-- Notification generator (idempotent: dedupe_key is unique)
-- ---------------------------------------------------------------------
create or replace function generate_notifications() returns int
language plpgsql security definer set search_path = public as $$
declare prefs jsonb; d_doc int; d_srv int; d_book int; n int := 0; c int;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select notification_prefs into prefs from business_settings where id = 1;
  d_doc := coalesce((prefs->>'document_expiry_days')::int, 30);
  d_srv := coalesce((prefs->>'service_reminder_days')::int, 14);
  d_book := coalesce((prefs->>'booking_reminder_days')::int, 2);

  -- student payments due within 3 days
  insert into notifications (kind, title, body, link, dedupe_key)
  select 'payment_due', 'Payment due: ' || s.full_name, i.invoice_number || ' — balance ' || i.balance || ' due ' || i.due_date, '/admin/billing', 'inv-due:' || i.id
  from invoices i join students s on s.id = i.student_id
  where i.status in ('unpaid','partially_paid') and i.balance > 0 and i.due_date between current_date and current_date + 3
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- overdue student payments
  insert into notifications (kind, title, body, link, dedupe_key)
  select 'payment_overdue', 'Overdue: ' || s.full_name, i.invoice_number || ' — balance ' || i.balance || ' was due ' || i.due_date, '/admin/billing', 'inv-overdue:' || i.id
  from invoices i join students s on s.id = i.student_id
  where i.status <> 'cancelled' and i.balance > 0 and i.due_date < current_date
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- upcoming confirmed bookings
  insert into notifications (kind, title, body, link, dedupe_key)
  select 'booking_soon', 'Upcoming booking ' || b.reference, v.name || ' on ' || to_char(b.start_at at time zone 'Asia/Colombo', 'DD Mon HH24:MI'), '/admin/bookings?open=' || b.id, 'booking-soon:' || b.id
  from hire_bookings b join vehicles v on v.id = b.vehicle_id
  where b.status = 'confirmed' and b.start_at between now() and now() + make_interval(days => d_book)
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- school routes with no driver
  insert into notifications (kind, title, body, link, dedupe_key)
  select 'no_driver', 'No driver assigned: ' || r.name, 'This active school route has no driver.', '/admin/routes', 'route-nodriver:' || r.id
  from transport_routes r where r.status = 'active' and r.driver_id is null
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- servicing due (date)
  insert into notifications (kind, title, body, link, dedupe_key)
  select 'service_due', 'Service due: ' || v.name, replace(m.category::text, '_', ' ') || ' due ' || m.next_service_date, '/admin/maintenance', 'service:' || m.vehicle_id || m.category || m.next_service_date
  from (select distinct on (vehicle_id, category) * from vehicle_maintenance order by vehicle_id, category, service_date desc) m
  join vehicles v on v.id = m.vehicle_id
  where not v.is_archived and m.next_service_date is not null and m.next_service_date <= current_date + d_srv
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- servicing due (odometer, within 500 km)
  insert into notifications (kind, title, body, link, dedupe_key)
  select 'service_due', 'Service due soon: ' || v.name, replace(m.category::text, '_', ' ') || ' at ' || m.next_service_odometer_km || ' km (now ' || v.odometer_km || ')', '/admin/maintenance', 'service-odo:' || m.vehicle_id || m.category || m.next_service_odometer_km
  from (select distinct on (vehicle_id, category) * from vehicle_maintenance order by vehicle_id, category, service_date desc) m
  join vehicles v on v.id = m.vehicle_id
  where not v.is_archived and m.next_service_odometer_km is not null and m.next_service_odometer_km - v.odometer_km <= 500
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- insurance / revenue licence / emission expiry (a renewal changes the date, so the next cycle gets a fresh key)
  insert into notifications (kind, title, body, link, dedupe_key)
  select 'doc_expiry', x.label || ' expiry: ' || v.name, 'Expires ' || x.d, '/admin/documents', 'doc:' || x.code || ':' || v.id || ':' || x.d
  from vehicles v, lateral (values ('Insurance', 'ins', v.insurance_expiry), ('Revenue licence', 'lic', v.revenue_licence_expiry), ('Emission test', 'emi', v.emission_expiry)) x(label, code, d)
  where not v.is_archived and x.d is not null and x.d <= current_date + d_doc
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- driver licences
  insert into notifications (kind, title, body, link, dedupe_key)
  select 'doc_expiry', 'Driving licence expiry: ' || d.full_name, 'Expires ' || d.licence_expiry, '/admin/documents', 'drvlic:' || d.id || ':' || d.licence_expiry
  from drivers d where not d.is_archived and d.status = 'active' and d.licence_expiry is not null and d.licence_expiry <= current_date + d_doc
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  -- customers who still owe money after the trip ended
  insert into notifications (kind, title, body, link, dedupe_key)
  select 'customer_owes', 'Outstanding payment: ' || cu.full_name, b.reference || ' — balance ' || (b.agreed_price - coalesce(p.paid, 0)), '/admin/bookings?open=' || b.id, 'cust-owes:' || b.id
  from hire_bookings b join customers cu on cu.id = b.customer_id
  left join (select booking_id, sum(amount) paid from payments where booking_id is not null group by booking_id) p on p.booking_id = b.id
  where b.status in ('confirmed','in_progress','completed') and b.end_at < now() and b.agreed_price - coalesce(p.paid, 0) > 0
  on conflict (dedupe_key) do nothing;
  get diagnostics c = row_count; n := n + c;

  return n;
end $$;

revoke all on function dashboard_summary(date,date), rpt_cash_matrix(text,text,date,date), rpt_vehicle_summary(date,date), rpt_position(date,date), generate_notifications() from public, anon;
grant execute on function dashboard_summary(date,date), rpt_cash_matrix(text,text,date,date), rpt_vehicle_summary(date,date), rpt_position(date,date), generate_notifications() to authenticated;
