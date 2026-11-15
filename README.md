# Transport Business Management System

A public company website plus a private admin dashboard for a small transport business:
school transport (monthly per-student billing) and bus / van / tuk-tuk hire, with or without a driver.

**Stack:** React 19 · Vite · TypeScript · Tailwind · React Router · React Hook Form + Zod · Recharts ·
Supabase (Postgres, Auth, Storage, Row Level Security) · jsPDF / write-excel-file for exports · deployed on Vercel.

## What is included

| Area | Highlights |
|------|-----------|
| Public website | Home, About, Services, Vehicles, School Transport, Contact, validated inquiry form (+ WhatsApp), 404 page — **all text, services and vehicles are edited from Admin → Website** |
| Admin sign-in | Email/password, password reset, `OWNER` / `ADMIN` roles, no public registration, deactivation |
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
   `0004_reports_notifications.sql` → `0005_hardening.sql`.
4. **Auth settings** (*Authentication* in the dashboard):
   - **Turn OFF "Allow new users to sign up"** (Sign In / Providers). This system has no public registration.
   - *URL Configuration*: set **Site URL** to your production address and add `http://localhost:5173/reset-password`
     and `https://<your-domain>/reset-password` to **Redirect URLs** (password reset links depend on it).
   - *Email*: Supabase's built-in mailer is heavily rate-limited. For reliable password-reset emails add your own SMTP
     provider (*Authentication → Emails → SMTP Settings*).
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

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` / `build` / `preview` | develop · production build · serve the build locally **with the production security headers** |
| `npm test` | app unit tests (Vitest) |
| `npm run test:db` | business-rule tests for every SQL migration, in an in-process Postgres (no Supabase needed) |
| `npm run security-check` | **live** check against your Supabase project: what the public, a signed-in non-admin, an ADMIN and a deactivated admin can and cannot do (creates and deletes throw-away users) |
| `npm run create-admin` | provision an administrator account |
| `npm run lint` | static analysis |

Run `npm run security-check` after every database change and after deployment. It must report all checks passed.

## Security model

- **Row Level Security on every table.** A request is allowed only if it comes from an *active* row in `profiles`
  (`is_admin()`); only an `OWNER` can create, change or deactivate accounts. Front-end route guards are for convenience only.
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

- Customer "contact history" (call/message log) is not built; notes on the customer record are used instead.
- Alerts are in-app only; there are no automatic email/SMS reminders.
- New administrators are created with `npm run create-admin` on a trusted computer (no in-app invite email), so the secret key
  never reaches the browser.
- Vehicle photos are visible to admins only; the public gets one image per listing, managed in Admin → Website → Vehicles.
- Reports are generated on demand; there is no scheduled emailing of reports.
