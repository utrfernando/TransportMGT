/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Serve the SAME security headers locally (`npm run preview`) that Vercel will send in production,
// so a Content-Security-Policy mistake shows up before deployment instead of after.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const headers: Record<string, string> = Object.fromEntries(
  (vercel.headers?.[0]?.headers ?? []).map((h: { key: string; value: string }) => [h.key, h.value]),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: { headers },
  // the SQL tests in supabase/tests use node:test (npm run test:db); vitest only runs the app tests
  test: { include: ['src/**/*.test.ts'] },
  build: {
    rollupOptions: {
      output: {
        // Only split out the big shared libraries the public site needs. Admin-only libraries
        // (recharts, jsPDF, Excel writer) stay in lazy chunks and never load for visitors.
        manualChunks: (id) => {
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
})
