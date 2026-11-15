-- =====================================================================
-- Admin-provisioned parent / customer accounts
--
-- The business creates the login for a student's family (or a hire customer) from the admin area, either
-- setting a password or emailing an invitation. Creating an auth user needs the Supabase SECRET key, so that
-- happens in a small server-side API (api/portal-accounts) — never in the browser. These functions are the
-- database half: they can be executed ONLY by the service role (that API), not by any signed-in user.
-- Run after 0006_customer_portal.sql.
-- =====================================================================

alter table students add column if not exists guardian_email text
  check (guardian_email is null or guardian_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

alter table portal_links add column if not exists created_by uuid references auth.users(id) on delete set null;

-- find an existing login by email (the browser can never read auth.users)
create or replace function portal_admin_find_user(p_email text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

-- link a login to students / customers (revives a removed link). Refuses staff accounts.
create or replace function portal_admin_link(p_user uuid, p_students uuid[], p_customers uuid[], p_by uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s uuid[] := coalesce(p_students, '{}'); c uuid[] := coalesce(p_customers, '{}'); u record; n int; sid uuid; cid uuid; ns int := 0; nc int := 0; nm text;
begin
  select id, email, raw_user_meta_data into u from auth.users where id = p_user;
  if not found then raise exception 'That login does not exist'; end if;
  if exists (select 1 from profiles where id = p_user) then raise exception 'That email belongs to a staff account and cannot be used for the customer portal'; end if;
  if cardinality(s) + cardinality(c) = 0 then raise exception 'Choose at least one student or customer'; end if;
  if cardinality(s) + cardinality(c) > 20 then raise exception 'Too many records at once'; end if;
  select count(*) into n from students where id = any(s);  if n <> cardinality(s) then raise exception 'A selected student does not exist'; end if;
  select count(*) into n from customers where id = any(c); if n <> cardinality(c) then raise exception 'A selected customer does not exist'; end if;
  nm := coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1));
  foreach sid in array s loop
    insert into portal_links (user_id, student_id, email, full_name, created_by) values (p_user, sid, u.email, nm, p_by)
    on conflict (user_id, student_id) do update set revoked_at = null, created_by = excluded.created_by;
    ns := ns + 1;
  end loop;
  foreach cid in array c loop
    insert into portal_links (user_id, customer_id, email, full_name, created_by) values (p_user, cid, u.email, nm, p_by)
    on conflict (user_id, customer_id) do update set revoked_at = null, created_by = excluded.created_by;
    nc := nc + 1;
  end loop;
  return jsonb_build_object('students', ns, 'customers', nc);
end $$;

-- is this login a staff account? (the API must never reset/disable/re-password staff through the customer endpoints)
create or replace function portal_admin_is_staff(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from profiles where id = p_user); $$;

-- does this login have any customer-portal link? (only those may be managed through the customer endpoints)
create or replace function portal_admin_has_links(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from portal_links where user_id = p_user); $$;

revoke all on function portal_admin_find_user(text), portal_admin_link(uuid, uuid[], uuid[], uuid), portal_admin_is_staff(uuid), portal_admin_has_links(uuid) from public, anon, authenticated;
grant execute on function portal_admin_find_user(text), portal_admin_link(uuid, uuid[], uuid[], uuid), portal_admin_is_staff(uuid), portal_admin_has_links(uuid) to service_role;
