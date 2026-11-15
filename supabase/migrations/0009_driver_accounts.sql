-- =====================================================================
-- Driver logins
--
-- A driver can have his own login and sees ONLY what the admin has assigned to him: his active routes (stops, map
-- pins, the students on each route and their pickup points), his vehicles, and the hires assigned to him.
-- He never sees fees, payments, prices, notes, other drivers or any other record.
-- As with the family portal, drivers get NO table privileges: everything comes from driver_overview(), a fixed,
-- curated function limited to auth.uid()'s own driver record. Logins are created by the admin-only server API.
-- Run after 0008_route_stop_locations.sql.
-- =====================================================================

alter table drivers add column if not exists user_id uuid unique references auth.users(id) on delete set null;
alter table drivers add column if not exists login_created_by uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------
-- Server-only (service role): link / inspect driver logins
-- ---------------------------------------------------------------------
create or replace function driver_admin_link(p_user uuid, p_driver uuid, p_by uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d drivers%rowtype;
begin
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'That login does not exist'; end if;
  if exists (select 1 from profiles where id = p_user) then raise exception 'That email belongs to a staff account and cannot be used as a driver login'; end if;
  select * into d from drivers where id = p_driver for update;
  if not found or d.is_archived then raise exception 'That driver does not exist'; end if;
  if d.user_id is not null and d.user_id <> p_user then raise exception 'This driver already has a login. Remove it first.'; end if;
  if exists (select 1 from drivers where user_id = p_user and id <> p_driver) then raise exception 'That email is already the login of another driver'; end if;
  update drivers set user_id = p_user, login_created_by = p_by where id = p_driver;
  return jsonb_build_object('driver', d.full_name);
end $$;

create or replace function driver_admin_is_driver(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from drivers where user_id = p_user); $$;

revoke all on function driver_admin_link(uuid, uuid, uuid), driver_admin_is_driver(uuid) from public, anon, authenticated;
grant execute on function driver_admin_link(uuid, uuid, uuid), driver_admin_is_driver(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Any signed-in user: what kind of login is this? (used only to choose the right start page)
-- ---------------------------------------------------------------------
create or replace function portal_whoami() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  return jsonb_build_object(
    'driver', exists (select 1 from drivers where user_id = auth.uid() and not is_archived and status <> 'inactive'),
    'family', exists (select 1 from portal_links where user_id = auth.uid() and revoked_at is null));
end $$;

-- ---------------------------------------------------------------------
-- The driver's own view (curated columns only)
-- ---------------------------------------------------------------------
create or replace function driver_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d drivers%rowtype;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into d from drivers where user_id = auth.uid() and not is_archived and status <> 'inactive';
  if not found then raise exception 'This login is not set up as a driver'; end if;

  return jsonb_build_object(
    'driver', jsonb_build_object('name', d.full_name, 'phone', d.phone, 'licence_expiry', d.licence_expiry, 'status', d.status),

    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'type', v.vehicle_type, 'registration_number', v.registration_number,
                                          'brand', v.brand, 'model', v.model, 'seats', v.seating_capacity, 'fuel', v.fuel_type, 'status', v.status) order by v.name)
      from vehicles v where not v.is_archived and v.id in (
        select d.assigned_vehicle_id where d.assigned_vehicle_id is not null
        union select r.vehicle_id from transport_routes r where r.driver_id = d.id and r.status = 'active' and r.vehicle_id is not null
        union select b.vehicle_id from hire_bookings b where b.assigned_driver_id = d.id and b.status in ('confirmed', 'in_progress'))), '[]'::jsonb),

    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'school', sc.name, 'days', r.operating_days, 'departure_time', r.departure_time, 'return_time', r.return_time,
        'vehicle', v.name, 'registration_number', v.registration_number,
        'stops', coalesce((select jsonb_agg(jsonb_build_object('type', st.stop_type, 'name', st.name, 'time', st.scheduled_time, 'lat', st.latitude, 'lng', st.longitude) order by st.sequence)
                           from route_stops st where st.route_id = r.id), '[]'::jsonb),
        'students', coalesce((select jsonb_agg(jsonb_build_object('name', s.full_name, 'code', s.student_code, 'pickup', s.pickup_location, 'dropoff', s.dropoff_location,
                                                                 'guardian', s.guardian_name, 'guardian_phone', s.guardian_phone) order by s.full_name)
                              from student_route_assignments a join students s on s.id = a.student_id
                              where a.route_id = r.id and a.end_date is null and s.status = 'active'), '[]'::jsonb)
      ) order by r.departure_time, r.name)
      from transport_routes r left join schools sc on sc.id = r.school_id left join vehicles v on v.id = r.vehicle_id
      where r.driver_id = d.id and r.status = 'active'), '[]'::jsonb),

    'trips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference', b.reference, 'status', b.status, 'hire_type', b.hire_type, 'start_at', b.start_at, 'end_at', b.end_at,
        'pickup', b.pickup_location, 'destination', b.destination, 'return_to', b.return_location, 'passengers', b.passenger_count,
        'vehicle', v.name, 'registration_number', v.registration_number, 'customer', c.full_name, 'customer_phone', c.phone, 'arrangement', b.arrangement
      ) order by b.start_at)
      from hire_bookings b join vehicles v on v.id = b.vehicle_id join customers c on c.id = b.customer_id
      where b.assigned_driver_id = d.id
        and ((b.status in ('confirmed', 'in_progress') and b.end_at > now() - interval '1 day')
          or (b.status = 'completed' and b.end_at > now() - interval '7 days'))), '[]'::jsonb)
  );
end $$;

revoke all on function portal_whoami(), driver_overview() from public, anon;
grant execute on function portal_whoami(), driver_overview() to authenticated;
