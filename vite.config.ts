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
  server: { port: Number(process.env.PORT) || 5173, watch: { ignored: ['**/.claude/**'] } },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
