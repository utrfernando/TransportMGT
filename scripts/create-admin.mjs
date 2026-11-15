// Provision an administrator account (no public sign-up exists).
// Usage: npm run create-admin -- --email name@example.com --name "Full Name" --role OWNER|ADMIN [--password "..."]
// Uses the Supabase secret key from .env (server-side only; never shipped to the browser).
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : undefined; };

const url = process.env.VITE_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const email = arg('email');
const name = arg('name');
const role = (arg('role') ?? 'ADMIN').toUpperCase();
const password = arg('password') ?? randomBytes(12).toString('base64url');

if (!url || !secret) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY in .env'); process.exit(1); }
if (!email || !name) { console.error('Usage: npm run create-admin -- --email <email> --name "<Full Name>" --role OWNER|ADMIN'); process.exit(1); }
if (!['OWNER', 'ADMIN'].includes(role)) { console.error('Role must be OWNER or ADMIN'); process.exit(1); }
if (password.length < 10) { console.error('Password must be at least 10 characters'); process.exit(1); }

const headers = { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };

const res = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST', headers,
  body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: name } }),
});
const user = await res.json();
if (!res.ok) { console.error('Could not create auth user:', user.msg ?? user.message ?? JSON.stringify(user)); process.exit(1); }

const pr = await fetch(`${url}/rest/v1/profiles`, {
  method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
  body: JSON.stringify({ id: user.id, email, full_name: name, role, is_active: true }),
});
if (!pr.ok) {
  console.error('Auth user created but profile insert failed (did you run the SQL migration?):', await pr.text());
  process.exit(1);
}

console.log(`\nCreated ${role}: ${email}`);
if (!arg('password')) console.log(`Temporary password: ${password}\n(Sign in, then change it with "Forgot password".)`);
