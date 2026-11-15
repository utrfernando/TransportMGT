/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { handlePortalAccounts } from './server/portalAccounts.ts'

// Serve the SAME security headers locally (`npm run preview`) that Vercel will send in production,
// so a Content-Security-Policy mistake shows up before deployment instead of after.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const headers: Record<string, string> = Object.fromEntries(
  (vercel.headers?.[0]?.headers ?? []).map((h: { key: string; value: string }) => [h.key, h.value]),
)

/**
 * Serves POST /api/portal-accounts locally (dev + preview) with the exact same code the Vercel function runs
 * (api/portal-accounts.ts). The Supabase secret key is read from .env on the server side only.
 */
function portalAccountsApi(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  const attach = (mount: Connect.Server['use']) => {
    mount('/api/portal-accounts', (req, res) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (c: Buffer) => { size += c.length; if (size < 100_000) chunks.push(c) })
      req.on('end', async () => {
        let body: unknown = null
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') } catch { /* invalid JSON -> validation error below */ }
        const out = await handlePortalAccounts(
          { method: req.method ?? 'GET', authorization: req.headers.authorization, origin: req.headers.origin, body },
          { url: env.VITE_SUPABASE_URL ?? '', anonKey: env.VITE_SUPABASE_ANON_KEY ?? '', secretKey: env.SUPABASE_SECRET_KEY ?? '', siteUrl: env.SITE_URL },
        )
        res.statusCode = out.status
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(out.body))
      })
    })
  }
  return {
    name: 'portal-accounts-api',
    configureServer(server) { attach(server.middlewares.use.bind(server.middlewares)) },
    configurePreviewServer(server) { attach(server.middlewares.use.bind(server.middlewares)) },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), portalAccountsApi(mode)],
  preview: { headers },
  // the SQL tests in supabase/tests use node:test (npm run test:db); vitest only runs the app tests
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
  build: {
    rollupOptions: {
      output: {
        // Only split out the big shared libraries the public site needs. Admin-only libraries
        // (recharts, jsPDF, Excel writer) stay in lazy chunks and never load for visitors.
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'motion'
          return undefined
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'framer-motion'],
  },
}))
