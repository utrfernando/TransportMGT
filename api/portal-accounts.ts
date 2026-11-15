// Vercel serverless function: POST /api/portal-accounts
// Needs these server-side environment variables on Vercel (NOT prefixed with VITE_ for the secret):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY   (optional: SITE_URL = https://your-domain)
import { handlePortalAccounts } from '../server/portalAccounts.ts';

interface VercelRequest { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
interface VercelResponse { status(code: number): VercelResponse; setHeader(name: string, value: string): void; json(body: unknown): void }

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const out = await handlePortalAccounts(
    { method: req.method ?? 'GET', authorization: first(req.headers.authorization), origin: first(req.headers.origin), body: req.body },
    { url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '', anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '', secretKey: process.env.SUPABASE_SECRET_KEY || '', siteUrl: process.env.SITE_URL },
  );
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
