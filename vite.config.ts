/// <reference types="vitest/config" />
import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Agent worktrees live under .claude/; keep their edits from reloading this dev server.
  // /api goes to the Go API when mocks are off (npm run dev:api); same origin, so the session cookie just works.
  server: {
    port: Number(process.env.PORT) || 5173,
    watch: { ignored: ['**/.claude/**'] },
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:8080' },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
