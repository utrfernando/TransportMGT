-- =====================================================================
-- Phase 6: hardening found during the security review.
-- Run after 0004_reports_notifications.sql.
-- =====================================================================

-- The public inquiry form could previously be flooded by cycling phone numbers
-- (the limit was per phone only). Add an overall cap so a bot cannot fill the inbox
-- and the admin notification list. Genuine volume for this business is a handful a day.
create or replace function submit_inquiry(
  p_name text, p_phone text, p_email text, p_service text, p_vehicle text, p_pickup text,
  p_destination text, p_travel_date date, p_passengers int, p_driver text, p_message text
) returns text language plpgsql security definer set search_path = public as $$
declare ref text; recent int; total int;
begin
  if char_length(trim(coalesce(p_name,''))) < 2 then raise exception 'Name is required'; end if;
  if p_phone !~ '^[0-9+()\-\s]{7,20}$' then raise exception 'Enter a valid phone number'; end if;
  if p_email is not null and p_email <> '' and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  if p_travel_date is not null and p_travel_date < current_date - 1 then raise exception 'Travel date is in the past'; end if;
  if p_service is null or char_length(p_service) > 80 then raise exception 'Choose a service'; end if;

  select count(*) into recent from public_inquiries where phone = p_phone and created_at > now() - interval '1 hour';
  if recent >= 5 then raise exception 'Too many requests. Please call us instead.'; end if;
  select count(*) into total from public_inquiries where created_at > now() - interval '1 hour';
  if total >= 60 then raise exception 'We are receiving a lot of requests right now. Please call us instead.'; end if;

  insert into public_inquiries (customer_name, phone, email, service, preferred_vehicle, pickup_location, destination, travel_date, passenger_count, driver_requirement, message)
  values (trim(p_name), trim(p_phone), nullif(trim(coalesce(p_email,'')), ''), p_service, nullif(p_vehicle,''), nullif(p_pickup,''), nullif(p_destination,''), p_travel_date, p_passengers, nullif(p_driver,''), nullif(p_message,''))
  returning reference into ref;
  insert into notifications (kind, title, body, link, dedupe_key)
  values ('inquiry', 'New inquiry ' || ref, p_name || ' — ' || p_service, '/admin/inquiries', 'inq:' || ref);
  return ref;
end $$;
grant execute on function submit_inquiry(text,text,text,text,text,text,text,date,int,text,text) to anon, authenticated;

-- Stop old notifications piling up forever: an admin can clear read ones older than 90 days.
create or replace function purge_old_notifications() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  delete from notifications where is_read and created_at < now() - interval '90 days';
  get diagnostics n = row_count; return n;
end $$;
revoke all on function purge_old_notifications() from public, anon;
grant execute on function purge_old_notifications() to authenticated;
