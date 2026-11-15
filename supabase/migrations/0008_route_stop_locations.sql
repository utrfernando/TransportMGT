-- =====================================================================
-- Map locations for route pickup / drop-off points
--
-- Each stop on a school route can be pinned on a map. Parents see a map of THEIR child's route only
-- (through portal_overview); coordinates of home addresses are never stored here — these are the shared
-- meeting points of a route.
-- Run after 0007_admin_provisioned_accounts.sql.
-- =====================================================================

alter table route_stops add column if not exists latitude numeric(9,6);
alter table route_stops add column if not exists longitude numeric(9,6);

alter table route_stops drop constraint if exists route_stops_location_check;
alter table route_stops add constraint route_stops_location_check check (
  (latitude is null and longitude is null)
  or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)
);

-- The parent portal now includes each stop's coordinates (same curated data as before, plus the map pin).
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
                   'stops', coalesce((select jsonb_agg(jsonb_build_object('type', st.stop_type, 'name', st.name, 'time', st.scheduled_time, 'lat', st.latitude, 'lng', st.longitude) order by st.sequence) from route_stops st where st.route_id = r.id), '[]'::jsonb))
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

revoke all on function portal_overview() from public, anon;
grant execute on function portal_overview() to authenticated;
