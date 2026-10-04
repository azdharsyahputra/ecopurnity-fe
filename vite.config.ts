
import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },


  server: {
    port: Number(process.env.PORT) || 5173,
    watch: { ignored: ['**/.claude/**'] },
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:8080', ws: true } },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
