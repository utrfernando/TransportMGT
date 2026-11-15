# Transport Business Management System

Public company website + private admin dashboard for a small transport business
(school transport, bus / van / tuk tuk hire).

**Stack:** React 19, Vite, TypeScript, Tailwind, React Router, React Hook Form + Zod, Recharts, Supabase (Postgres, Auth, Storage, RLS).

## Status

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Schema + RLS, auth, admin shell, public website, inquiries, settings, users | **Done** |
| 2 | Vehicles, drivers, customers, schools, students, routes | **Done** |
| 3 | Monthly billing, hire bookings, calendar, payments | |
| 4 | Income, expenses, fuel, maintenance, documents | Next |
| 5 | Analytics, reports, PDF/Excel export, notifications | |
| 6 | Testing, security review, deployment | |

The admin sidebar only lists modules that exist; new items appear as each phase ships.

## Setup

1. **Create a Supabase project** (new, empty).
2. **Environment** – copy `.env.example` to `.env`:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable key>
   SUPABASE_SECRET_KEY=<secret key>      # server-side only, used by scripts/. NEVER prefix with VITE_
   ```
3. **Database** – open *Supabase → SQL Editor*, paste the whole of
   `supabase/migrations/0001_transport_schema.sql`, run it, then do the same for `0002_billing_bookings.sql`. It creates every table, enum,
   trigger, RLS policy, storage bucket and the seed data (services, expense categories).
4. **Auth settings** – *Authentication → Providers → Email*: **disable "Allow new users to sign up"**
   (there is no public registration). Under *URL Configuration* add `http://localhost:5173/reset-password`
   and your production URL + `/reset-password` to the redirect list.
5. **Create the two administrators** (from a trusted machine):
   ```bash
   npm install
   npm run create-admin -- --email owner@example.com --name "Owner Name" --role OWNER
   npm run create-admin -- --email son@example.com   --name "Admin Name" --role ADMIN
   ```
   A temporary password is printed; users can change it via *Forgot password*.
6. **Run:** `npm run dev` → http://localhost:5173 · admin at `/login`.

## Security model

- Every private table has RLS enabled; policies allow access only to active rows in `profiles`
  (`is_admin()`), and only the `OWNER` can manage accounts. Frontend route guards are UX only.
- Anonymous visitors can read **only** published `services`, `website_content`, and the `public_vehicles`
  view (no registration numbers or notes). They cannot read inquiries, students, finance or customers.
- Public inquiries go through the `submit_inquiry()` RPC (server-side validation + per-phone rate limit);
  anon has no insert privilege on the table.
- The secret key is only used by `scripts/create-admin.mjs`; the browser only ever has the publishable key.
- Storage: `public-assets` (logos, public vehicle photos) and a private `private-files` bucket for receipts/documents,
  with size and MIME limits.
- Audit triggers record inserts/updates/deletes on the main business tables in `audit_logs`.

## Database notes

- Money is `numeric(12,2)`. Invoices are unique per `(student, billing_month)`, so
  `generate_monthly_invoices(month)` is idempotent and pro-rates part-months per the setting.
- `payments.reference` is unique; a trigger rejects payments that exceed the invoice/booking balance and
  recalculates invoice status from the payment rows (single source of truth).
- Confirmed / in-progress hire bookings cannot overlap for the same vehicle or driver (Postgres exclusion constraints).
- Fuel and maintenance records create exactly one linked expense (unique FK), so spending is never double counted.
- Customers are unique by phone number digits; vehicle registrations are unique among non-archived vehicles.
- `invoices.previous_balance` is informational; receivables are the sum of invoice balances (no double counting).

## Deployment (Vercel)

Import the repo, framework preset **Vite**, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
(do **not** add the secret key), add a rewrite so all routes serve `index.html`
(`vercel.json`: `{"rewrites":[{"source":"/(.*)","destination":"/"}]}`).
