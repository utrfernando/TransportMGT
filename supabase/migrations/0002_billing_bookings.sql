-- =====================================================================
-- Phase 3: payment integrity, invoice adjustments, advances, availability
-- checks, booking guards, driver payments, inquiry conversion.
-- Run after 0001_transport_schema.sql.
-- =====================================================================

-- Idempotency: a retried / double-clicked submit carries the same key and is rejected by the unique index
alter table payments add column if not exists idempotency_key uuid;
create unique index if not exists uq_payments_idempotency on payments (idempotency_key) where idempotency_key is not null;

-- ---------------------------------------------------------------------
-- Payments: derive category / links server-side; never trust the client
-- ---------------------------------------------------------------------
create or replace function trg_payment_validate() returns trigger language plpgsql security definer set search_path = public as $$
declare v_owed numeric; v_paid numeric; inv invoices%rowtype; bk hire_bookings%rowtype;
begin
  if new.reference is null or new.reference = '' then
    new.reference := (select receipt_prefix from business_settings where id = 1) || '-' || to_char(new.payment_date, 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 6, '0');
  end if;
  new.recorded_by := coalesce(new.recorded_by, auth.uid());

  if new.invoice_id is not null then
    select * into inv from invoices where id = new.invoice_id;
    if not found then raise exception 'Invoice not found'; end if;
    if inv.status = 'cancelled' then raise exception 'Cannot record a payment against a cancelled invoice'; end if;
    new.student_id := inv.student_id;
    new.category := 'school_transport';
    select coalesce(sum(amount),0) into v_paid from payments where invoice_id = new.invoice_id and id is distinct from new.id;
    if v_paid + new.amount > inv.total_payable then
      raise exception 'Payment exceeds invoice balance (balance: %)', inv.total_payable - v_paid;
    end if;
  elsif new.booking_id is not null then
    select * into bk from hire_bookings where id = new.booking_id;
    if not found then raise exception 'Booking not found'; end if;
    if bk.status = 'cancelled' then raise exception 'Cannot record a payment against a cancelled booking'; end if;
    new.vehicle_id := bk.vehicle_id;
    new.category := case bk.hire_type when 'bus_hire' then 'bus_hire' when 'van_hire' then 'van_hire' when 'tuk_tuk_hire' then 'tuk_tuk_hire' else 'other' end;
    select coalesce(sum(amount),0) into v_paid from payments where booking_id = new.booking_id and id is distinct from new.id;
    if v_paid + new.amount > bk.agreed_price then
      raise exception 'Payment exceeds booking balance (balance: %)', bk.agreed_price - v_paid;
    end if;
  elsif new.student_id is not null then
    new.category := 'school_transport';   -- advance payment held as credit
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Apply an advance payment to an invoice (splits the payment if larger)
-- ---------------------------------------------------------------------
create or replace function apply_advance(p_payment uuid, p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype; inv invoices%rowtype; remaining numeric(12,2);
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select * into p from payments where id = p_payment for update;
  if not found or p.invoice_id is not null or p.booking_id is not null or p.student_id is null then
    raise exception 'This payment is not an unapplied advance';
  end if;
  select * into inv from invoices where id = p_invoice for update;
  if not found or inv.student_id <> p.student_id then raise exception 'Invoice does not belong to this student'; end if;
  if inv.status = 'cancelled' then raise exception 'Invoice is cancelled'; end if;
  remaining := inv.total_payable - inv.amount_paid;
  if remaining <= 0 then raise exception 'Invoice is already fully paid'; end if;
  if p.amount <= remaining then
    update payments set invoice_id = p_invoice where id = p_payment;
  else
    update payments set amount = remaining, invoice_id = p_invoice where id = p_payment;
    insert into payments (reference, payment_date, amount, method, category, student_id, notes)
    values ('', p.payment_date, p.amount - remaining, p.method, 'school_transport', p.student_id, 'Advance credit remaining from ' || p.reference);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Manual invoice adjustment (audited via audit trigger + invoice item)
-- ---------------------------------------------------------------------
create or replace function adjust_invoice(p_invoice uuid, p_discount numeric, p_adjustment numeric, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices%rowtype; new_total numeric(12,2);
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A reason is required for adjustments'; end if;
  if p_discount < 0 then raise exception 'Discount cannot be negative'; end if;
  select * into inv from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status = 'cancelled' then raise exception 'Invoice is cancelled'; end if;
  new_total := inv.monthly_fee - p_discount + p_adjustment;
  if new_total < 0 then raise exception 'Total payable cannot be negative'; end if;
  if new_total < inv.amount_paid then raise exception 'New total (%) is below the amount already paid (%)', new_total, inv.amount_paid; end if;
  update invoices set discount = p_discount, adjustment = p_adjustment where id = p_invoice;
  insert into invoice_items (invoice_id, description, amount)
  values (p_invoice, 'Adjustment: ' || trim(p_reason), (p_adjustment - p_discount) - (inv.adjustment - inv.discount));
  perform recalc_invoice(p_invoice);
end $$;

create or replace function cancel_invoice(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices%rowtype;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A reason is required'; end if;
  select * into inv from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if exists (select 1 from payments where invoice_id = p_invoice) then raise exception 'Invoice has payments; adjust it instead of cancelling'; end if;
  update invoices set status = 'cancelled', notes = coalesce(notes || E'\n', '') || 'Cancelled: ' || trim(p_reason) where id = p_invoice;
end $$;

-- ---------------------------------------------------------------------
-- Driver payments (creates the linked "Driver payments" expense atomically)
-- booking_driver_assignments.advance_paid = total paid to the driver so far
-- ---------------------------------------------------------------------
create or replace function pay_driver(p_assignment uuid, p_amount numeric, p_method payment_method default 'cash') returns void
language plpgsql security definer set search_path = public as $$
declare a booking_driver_assignments%rowtype; b hire_bookings%rowtype; cat uuid;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  select * into a from booking_driver_assignments where id = p_assignment for update;
  if not found then raise exception 'Driver assignment not found'; end if;
  if a.advance_paid + p_amount > a.agreed_fee then raise exception 'Payment exceeds the agreed driver fee (remaining: %)', a.agreed_fee - a.advance_paid; end if;
  select * into b from hire_bookings where id = a.booking_id;
  select id into cat from expense_categories where name = 'Driver payments';
  update booking_driver_assignments
    set advance_paid = advance_paid + p_amount,
        payment_status = case when advance_paid + p_amount >= agreed_fee then 'paid'::driver_payment_status else 'partially_paid'::driver_payment_status end
    where id = p_assignment;
  insert into expenses (expense_date, category_id, description, amount, vehicle_id, booking_id, payment_method, recorded_by)
  values (current_date, cat, 'Driver fee — ' || b.reference, p_amount, b.vehicle_id, b.id, p_method, auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- Availability: returns [{kind, severity, message}]
-- ---------------------------------------------------------------------
create or replace function availability_internal(
  p_vehicle uuid, p_start timestamptz, p_end timestamptz, p_driver uuid default null, p_exclude uuid default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'Asia/Colombo';
  res jsonb := '[]'::jsonb; v vehicles%rowtype; r record; d date; d1 date; d2 date;
begin
  if p_end <= p_start then return jsonb_build_array(jsonb_build_object('kind','time','severity','block','message','End must be after start')); end if;
  select * into v from vehicles where id = p_vehicle;
  if not found then return jsonb_build_array(jsonb_build_object('kind','vehicle','severity','block','message','Vehicle not found')); end if;
  if v.is_archived or v.status <> 'active' then
    res := res || jsonb_build_object('kind','vehicle','severity','block','message', v.name || ' is not available (status: ' || v.status::text || ')');
  end if;

  for r in select reference, start_at, end_at from hire_bookings
           where vehicle_id = p_vehicle and status in ('confirmed','in_progress') and id is distinct from p_exclude
             and tstzrange(start_at, end_at) && tstzrange(p_start, p_end) loop
    res := res || jsonb_build_object('kind','booking','severity','block','message',
      'Vehicle already booked: ' || r.reference || ' (' || to_char(r.start_at at time zone tz, 'DD Mon HH24:MI') || ' – ' || to_char(r.end_at at time zone tz, 'DD Mon HH24:MI') || ')');
  end loop;

  if p_driver is not null then
    for r in select reference, start_at, end_at from hire_bookings
             where assigned_driver_id = p_driver and status in ('confirmed','in_progress') and id is distinct from p_exclude
               and tstzrange(start_at, end_at) && tstzrange(p_start, p_end) loop
      res := res || jsonb_build_object('kind','driver','severity','block','message',
        'Driver already assigned: ' || r.reference || ' (' || to_char(r.start_at at time zone tz, 'DD Mon HH24:MI') || ' – ' || to_char(r.end_at at time zone tz, 'DD Mon HH24:MI') || ')');
    end loop;
  end if;

  d1 := (p_start at time zone tz)::date;  d2 := (p_end at time zone tz)::date;
  for r in select service_date, next_service_date from vehicle_maintenance
           where vehicle_id = p_vehicle and (service_date between d1 and d2 or next_service_date between d1 and d2) loop
    res := res || jsonb_build_object('kind','maintenance','severity','block','message',
      'Maintenance scheduled on ' || to_char(case when r.service_date between d1 and d2 then r.service_date else r.next_service_date end, 'DD Mon YYYY'));
  end loop;

  -- school routes on the same vehicle (or driver), expanded over each day in range (max 62 days)
  for d in select generate_series(d1, least(d2, d1 + 62), interval '1 day')::date loop
    for r in select name, departure_time, return_time from transport_routes
             where status = 'active' and (vehicle_id = p_vehicle or (p_driver is not null and driver_id = p_driver))
               and extract(dow from d)::int = any(operating_days)
               and tstzrange(((d + departure_time) at time zone tz), ((d + return_time) at time zone tz)) && tstzrange(p_start, p_end) loop
      res := res || jsonb_build_object('kind','route','severity','block','message',
        'School route "' || r.name || '" runs ' || to_char(d, 'DD Mon') || ' ' || to_char(r.departure_time, 'HH24:MI') || '–' || to_char(r.return_time, 'HH24:MI'));
    end loop;
  end loop;
  return res;
end $$;

create or replace function check_vehicle_availability(
  p_vehicle uuid, p_start timestamptz, p_end timestamptz, p_driver uuid default null, p_exclude uuid default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  return availability_internal(p_vehicle, p_start, p_end, p_driver, p_exclude);
end $$;

-- Guard: confirmed / in-progress bookings must pass the availability check and use a valid driver
create or replace function trg_booking_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare chk jsonb; msg text; lic date;
begin
  if new.status in ('confirmed','in_progress') then
    chk := availability_internal(new.vehicle_id, new.start_at, new.end_at, new.assigned_driver_id, case when tg_op = 'UPDATE' then new.id end);
    select string_agg(e->>'message', '; ') into msg from jsonb_array_elements(chk) e where e->>'severity' = 'block';
    if msg is not null then raise exception 'Cannot confirm booking: %', msg; end if;
    if new.assigned_driver_id is not null then
      select licence_expiry into lic from drivers where id = new.assigned_driver_id;
      if lic is not null and lic < (new.end_at at time zone 'Asia/Colombo')::date then
        raise exception 'Cannot confirm booking: the assigned driver''s licence expires before the trip ends (%)', lic;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger trg_bookings_guard before insert or update on hire_bookings for each row execute function trg_booking_guard();

-- ---------------------------------------------------------------------
-- Convert an inquiry into customer + booking in one transaction
-- ---------------------------------------------------------------------
create or replace function convert_inquiry_to_booking(
  p_inquiry uuid, p_vehicle uuid, p_start timestamptz, p_end timestamptz, p_price numeric default 0,
  p_arrangement driver_arrangement default 'owner_drives', p_driver uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare q public_inquiries%rowtype; cust uuid; bid uuid; ht hire_type;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select * into q from public_inquiries where id = p_inquiry for update;
  if not found then raise exception 'Inquiry not found'; end if;
  if q.status = 'converted' then raise exception 'This inquiry was already converted'; end if;

  select id into cust from customers
   where not is_archived and regexp_replace(phone, '\D', '', 'g') = regexp_replace(q.phone, '\D', '', 'g') limit 1;
  if cust is null then
    insert into customers (full_name, phone, email, category) values (q.customer_name, q.phone, q.email, 'individual') returning id into cust;
  end if;

  ht := case when lower(q.service) like 'bus%' then 'bus_hire' when lower(q.service) like 'van%' then 'van_hire'
             when lower(q.service) like 'tuk%' then 'tuk_tuk_hire' else 'private' end;
  insert into hire_bookings (customer_id, vehicle_id, hire_type, start_at, end_at, pickup_location, destination, passenger_count,
                             agreed_price, arrangement, assigned_driver_id, status, inquiry_id, notes, created_by)
  values (cust, p_vehicle, ht, p_start, p_end, q.pickup_location, q.destination, q.passenger_count, coalesce(p_price, 0),
          p_arrangement, p_driver, 'inquiry', q.id, 'Converted from inquiry ' || q.reference || coalesce(E'\n' || q.message, ''), auth.uid())
  returning id into bid;
  update public_inquiries set status = 'converted', converted_booking_id = bid where id = q.id;
  return bid;
end $$;

revoke all on function availability_internal(uuid,timestamptz,timestamptz,uuid,uuid) from public, anon, authenticated;
revoke all on function apply_advance(uuid,uuid), adjust_invoice(uuid,numeric,numeric,text), cancel_invoice(uuid,text), pay_driver(uuid,numeric,payment_method),
  check_vehicle_availability(uuid,timestamptz,timestamptz,uuid,uuid), convert_inquiry_to_booking(uuid,uuid,timestamptz,timestamptz,numeric,driver_arrangement,uuid)
  from public, anon;
grant execute on function apply_advance(uuid,uuid), adjust_invoice(uuid,numeric,numeric,text), cancel_invoice(uuid,text), pay_driver(uuid,numeric,payment_method),
  check_vehicle_availability(uuid,timestamptz,timestamptz,uuid,uuid), convert_inquiry_to_booking(uuid,uuid,timestamptz,timestamptz,numeric,driver_arrangement,uuid)
  to authenticated;
