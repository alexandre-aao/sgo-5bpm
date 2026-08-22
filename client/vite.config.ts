import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3005',
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com; connect-src 'self' https://*.supabase.co https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'",
    },
  },
})
