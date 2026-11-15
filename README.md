# Transport Business Management System

A public company website plus a private admin dashboard for a small transport business:
school transport (monthly per-student billing) and bus / van / tuk-tuk hire, with or without a driver.

**Stack:** React 19 · Vite · TypeScript · Tailwind · React Router · React Hook Form + Zod · Recharts ·
Supabase (Postgres, Auth, Storage, Row Level Security) · jsPDF / write-excel-file for exports · deployed on Vercel.

## What is included

| Area | Highlights |
|------|-----------|
| Public website | Home, About, Services, Vehicles, School Transport, Contact, validated inquiry form (+ WhatsApp), 404 page — **all text, services and vehicles are edited from Admin → Website** |
| Admin sign-in | Email/password, password reset, `OWNER` / `ADMIN` roles, no public staff registration, deactivation |
| Customer & parent portal | Parents and hire customers sign up, link their records with a one-time access code, then see their child's route, fees, payments, receipts and hires |
| Fleet | Vehicles (photos, expiry dates, public listing), drivers, documents & renewals, maintenance, fuel |
| School transport | Schools, students, routes with stops, history-preserving route assignments |
| Billing | Idempotent monthly invoices, part-month pro-rating, partial / advance payments, adjustments, PDF receipts |
| Hires | Bookings with live availability checks, driver fees, customer payments, inquiry → booking conversion, calendar |
| Money | Income, expenses (+ receipts), fuel & maintenance auto-expenses, dashboard, 18 reports with PDF / Excel export |
| Operations | Notifications, audit log, business settings |

## Setup

1. **Create a Supabase project** (a new, empty one).
2. **Environment** – copy `.env.example` to `.env` and fill it in:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable key>
   SUPABASE_SECRET_KEY=<secret key>     # server-side only: used by scripts/ — NEVER prefix with VITE_, never put it on Vercel
   ```
3. **Database** – in *Supabase → SQL Editor* run these files **in order**, each once:
   `supabase/migrations/0001_transport_schema.sql` → `0002_billing_bookings.sql` → `0003_finance_upkeep.sql` →
   `0004_reports_notifications.sql` → `0005_hardening.sql` → `0006_customer_portal.sql`.
4. **Auth settings** (*Authentication* in the dashboard):
   - **Keep "Allow new users to sign up" ON and "Confirm email" ON** (Sign In / Providers). Parents and customers create their own
     accounts. A new account can see **nothing** until you give it an access code (see *Customer & parent portal* below), and staff
     accounts can only be created with `npm run create-admin`. Because sign-up is open, also enable **CAPTCHA** (*Authentication →
     Attack Protection → Turnstile/hCaptcha*) to keep bots from filling the user list.
   - *URL Configuration*: set **Site URL** to your production address and add `http://localhost:5173/reset-password`
     and `https://<your-domain>/reset-password` to **Redirect URLs** (password reset links depend on it).
   - *Email*: confirmation and password-reset emails are essential now. Supabase's built-in mailer is limited to a couple of emails
     per hour, so add your own SMTP provider (*Authentication → Emails → SMTP Settings*) before inviting customers.
   - Optionally raise the minimum password length (*Sign In / Providers → Email*).
5. **Create the two administrators** from a trusted computer:
   ```bash
   npm install
   npm run create-admin -- --email owner@example.com --name "Owner Name" --role OWNER
   npm run create-admin -- --email admin@example.com --name "Admin Name" --role ADMIN
   ```
   A temporary password is printed once. Each person should then use **Forgot password** to choose their own.
6. **Run it:** `npm run dev` → http://localhost:5173 (admin at `/login`).
7. In the admin area open **Business Settings** and fill in the business name, logo, phone, WhatsApp, address and social links.

## Customer & parent portal

Parents/guardians and hire customers get their own login at `/account` (linked from the website header).

1. They create an account (`/account/register`) and confirm their email.
2. In **Admin → Portal Access** (or the *Portal access code* button on a student / customer) you create a **one-time access code**
   for their child (siblings sharing a guardian phone are pre-ticked) or their hire records, and send it by WhatsApp or phone.
   Only give a code to someone you have verified yourself.
3. They enter the code on their account page. From then on they see **only** their linked records: route, stops and timings,
   monthly fees, payments and receipts (PDF), and hires with balances. You can remove access at any time.

How it is kept safe: customers have no database table access at all — everything they see comes from fixed `portal_*` database
functions that return curated columns for the records linked to *their* login (never notes, expenses, margins, registration numbers,
other families' data). Codes are random, single-use, expire (7–30 days), are stored only as a hash and are shown to you once;
wrong guesses are limited to 5 per hour per account; an email address must be confirmed before a code can be redeemed.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` / `build` / `preview` | develop · production build · serve the build locally **with the production security headers** |
| `npm test` | app unit tests (Vitest) |
| `npm run test:db` | business-rule tests for every SQL migration, in an in-process Postgres (no Supabase needed) |
| `npm run security-check` | **live** check against your Supabase project: what the public, a signed-in non-admin, an ADMIN, a deactivated admin and linked parents can and cannot do — including that one family can never see another's data (creates and deletes throw-away users and records; `--probe-signup` also checks the sign-up endpoint) |
| `npm run create-admin` | provision an administrator account |
| `npm run lint` | static analysis |

Run `npm run security-check` after every database change and after deployment. It must report all checks passed.

## Security model

- **Row Level Security on every table.** A request is allowed only if it comes from an *active* row in `profiles`
  (`is_admin()`); only an `OWNER` can create, change or deactivate accounts. Front-end route guards are for convenience only.
- **Customers (parents / hirers)** read through the `portal_*` functions only, limited to records linked to them by a one-time code.
- **The public can read** only published `services`, `website_content`, and the `public_vehicles` view (title, seats, fuel type,
  description — never registration numbers, notes or odometer). Student, customer, financial and inquiry data is unreachable.
- **Inquiry form** goes through the `submit_inquiry()` function: server-side validation, a per-phone and an overall hourly limit;
  anonymous users have no direct insert privilege.
- **Money is protected in the database**, not the browser: payments cannot exceed an invoice/booking balance, retries are
  idempotent, invoices are unique per student per month, category/vehicle/student links are derived server-side, fuel /
  maintenance / driver-payment expenses are locked to their source record, and confirmed bookings cannot overlap.
- **Files**: receipts and documents live in a **private** bucket (10 MB, JPG/PNG/WebP/PDF only) and are opened through
  5-minute signed links. Only logos and public vehicle photos use the public bucket.
- **Audit log**: inserts, updates and deletes on business tables are recorded with the user and before/after values; the log
  cannot be edited or deleted through the app.
- **Browser hardening**: strict Content-Security-Policy, `X-Frame-Options: DENY`, HSTS, `nosniff`, Referrer/Permissions policies
  (see `vercel.json`). The Supabase **secret key is never shipped to the browser**.
- **Dependencies**: `npm audit --omit=dev` reports 0 vulnerabilities.

> The GitHub repository may be public. `.env` is git-ignored and no keys are committed. If a key is ever pasted into
> chat/email/screenshots, rotate it in *Supabase → Project Settings → API*.

## Deploying to Vercel

1. Push the repo to GitHub and **Import** it in Vercel (framework preset: **Vite**; build `npm run build`; output `dist`).
2. Add environment variables (Production **and** Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
   **Do not add `SUPABASE_SECRET_KEY`.**
3. Deploy. `vercel.json` already contains the SPA rewrite, security headers and asset caching.
4. In Supabase → Authentication → URL Configuration set the **Site URL** and **Redirect URLs** to the Vercel / custom domain.
5. Add your custom domain in Vercel (*Settings → Domains*).
6. **Verify the live site:**
   - open `/`, `/vehicles`, `/contact`; submit a test inquiry and confirm it appears in *Admin → Inquiries* (then close it);
   - sign in at `/login`, check the dashboard, open a report and export PDF + Excel, record a test payment and download its receipt;
   - run `npm run security-check` locally (it targets the same Supabase project);
   - check the browser console for Content-Security-Policy errors.
7. **Backups:** enable daily backups / point-in-time recovery in Supabase (*Database → Backups*; paid plans) or schedule a
   periodic `pg_dump`. Financial records are the business — keep an off-site copy.

## Editing the public website

*Admin → Website* controls what visitors see: the home-page banner and headings, “Why choose us” cards, About-page standards,
school-transport text and steps, the **Services** list (add, hide, reorder — also feeds the inquiry form's “Service required”
list) and the **Vehicles** shown on the site (title, text, photo, order). Name, logo, contact details, social links, About text,
mission and vision are in *Business Settings*. “Restore original wording” undoes text edits on a tab. Nothing private can be
published from here: registration numbers, notes and student data are never part of the public data.

## Monthly routine

1. *Student Billing → Generate invoices* for the month (safe to run again; nothing is duplicated).
2. Record payments as they arrive (receipts are generated automatically). Record advances with *Record advance*.
3. Check *Notifications* for overdue payments, expiring documents and servicing.
4. Run *Reports → Overall profit & loss* and export it for your records.

## Known limitations

- Customers cannot pay online yet; the portal shows what is owed and payments are recorded by staff.
- A parent who loses access to their email must be re-linked with a new code.
- Customer "contact history" (call/message log) is not built; notes on the customer record are used instead.
- Alerts are in-app only; there are no automatic email/SMS reminders.
- New administrators are created with `npm run create-admin` on a trusted computer (no in-app invite email), so the secret key
  never reaches the browser.
- Vehicle photos are visible to admins only; the public gets one image per listing, managed in Admin → Website → Vehicles.
- Reports are generated on demand; there is no scheduled emailing of reports.
