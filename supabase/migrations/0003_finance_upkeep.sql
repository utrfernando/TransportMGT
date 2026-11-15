-- =====================================================================
-- Phase 4: expenses integrity, fuel / maintenance links, document sync
-- Run after 0002_billing_bookings.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Expenses: record where each came from; system-generated ones can only be
-- changed through their source module (fuel, maintenance, driver payment).
-- ---------------------------------------------------------------------
alter table expenses add column if not exists source text not null default 'manual'
  check (source in ('manual', 'fuel', 'maintenance', 'driver_payment'));

update expenses set source = 'fuel' where fuel_record_id is not null and source = 'manual';
update expenses set source = 'maintenance' where maintenance_id is not null and source = 'manual';
update expenses e set source = 'driver_payment'
  from expense_categories c where c.id = e.category_id and c.name = 'Driver payments' and e.booking_id is not null and e.source = 'manual';

create or replace function trg_expense_guard() returns trigger language plpgsql as $$
begin
  -- depth 1 = only this guard is running (a direct user statement); >1 = change made by another trigger or an FK cascade
  if old.source <> 'manual' and pg_trigger_depth() = 1 then
    raise exception 'This expense is created automatically (%). Change it from its source record instead.', replace(old.source, '_', ' ');
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;
create trigger trg_expenses_guard before update or delete on expenses for each row execute function trg_expense_guard();

-- Fuel: cost must be positive; one linked expense, kept in sync (upsert)
alter table fuel_records drop constraint if exists fuel_records_total_cost_check;
alter table fuel_records add constraint fuel_records_total_cost_check check (total_cost > 0);

drop trigger if exists trg_fuel_exp_ai on fuel_records;
drop trigger if exists trg_fuel_exp_au on fuel_records;
create or replace function trg_fuel_expense() returns trigger language plpgsql security definer set search_path = public as $$
declare cat uuid;
begin
  select id into cat from expense_categories where name = 'Fuel';
  insert into expenses (expense_date, category_id, description, amount, vehicle_id, supplier, receipt_path, fuel_record_id, source, recorded_by)
  values (new.fuel_date, cat, 'Fuel — ' || new.litres || ' L', new.total_cost, new.vehicle_id, new.fuel_station, new.receipt_path, new.id, 'fuel', coalesce(new.created_by, auth.uid()))
  on conflict (fuel_record_id) do update set expense_date = excluded.expense_date, amount = excluded.amount, vehicle_id = excluded.vehicle_id,
    supplier = excluded.supplier, receipt_path = excluded.receipt_path, description = excluded.description;
  return new;
end $$;
create trigger trg_fuel_expense_sync after insert or update on fuel_records for each row execute function trg_fuel_expense();

-- Maintenance: expense exists only while cost > 0
drop trigger if exists trg_maint_exp_ai on vehicle_maintenance;
drop trigger if exists trg_maint_exp_au on vehicle_maintenance;
create or replace function trg_maint_expense() returns trigger language plpgsql security definer set search_path = public as $$
declare cat uuid;
begin
  if new.cost > 0 then
    select id into cat from expense_categories where name = 'Maintenance';
    insert into expenses (expense_date, category_id, description, amount, vehicle_id, supplier, receipt_path, maintenance_id, source, recorded_by)
    values (new.service_date, cat, coalesce(nullif(new.description, ''), replace(new.category::text, '_', ' ')), new.cost, new.vehicle_id, new.service_provider, new.receipt_path, new.id, 'maintenance', coalesce(new.created_by, auth.uid()))
    on conflict (maintenance_id) do update set expense_date = excluded.expense_date, amount = excluded.amount, vehicle_id = excluded.vehicle_id,
      supplier = excluded.supplier, receipt_path = excluded.receipt_path, description = excluded.description;
  else
    delete from expenses where maintenance_id = new.id;
  end if;
  return new;
end $$;
create trigger trg_maint_expense_sync after insert or update on vehicle_maintenance for each row execute function trg_maint_expense();

-- Driver payments are tagged so they cannot be edited away from the driver ledger
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
  insert into expenses (expense_date, category_id, description, amount, vehicle_id, booking_id, payment_method, source, recorded_by)
  values (current_date, cat, 'Driver fee — ' || b.reference, p_amount, b.vehicle_id, b.id, p_method, 'driver_payment', auth.uid());
end $$;

-- Latest fuel / maintenance odometer readings keep the vehicle's odometer current (never lowered)
create or replace function trg_sync_odometer() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.odometer_km is not null then
    update vehicles set odometer_km = new.odometer_km where id = new.vehicle_id and odometer_km < new.odometer_km;
  end if;
  return new;
end $$;
create trigger trg_fuel_odo after insert or update on fuel_records for each row execute function trg_sync_odometer();
create trigger trg_maint_odo after insert or update on vehicle_maintenance for each row execute function trg_sync_odometer();

-- ---------------------------------------------------------------------
-- Documents: keep vehicles.*_expiry in step with the latest valid document
-- ---------------------------------------------------------------------
create or replace function trg_doc_sync_vehicle() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.expiry_date is null then return new; end if;
  if new.doc_type = 'insurance' then
    update vehicles set insurance_expiry = new.expiry_date where id = new.vehicle_id and (insurance_expiry is null or insurance_expiry < new.expiry_date);
  elsif new.doc_type = 'revenue_licence' then
    update vehicles set revenue_licence_expiry = new.expiry_date where id = new.vehicle_id and (revenue_licence_expiry is null or revenue_licence_expiry < new.expiry_date);
  elsif new.doc_type = 'emission_certificate' then
    update vehicles set emission_expiry = new.expiry_date where id = new.vehicle_id and (emission_expiry is null or emission_expiry < new.expiry_date);
  end if;
  return new;
end $$;
create trigger trg_doc_sync after insert or update on vehicle_documents for each row execute function trg_doc_sync_vehicle();

revoke all on function pay_driver(uuid,numeric,payment_method) from public, anon;
grant execute on function pay_driver(uuid,numeric,payment_method) to authenticated;
