import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // Forward /api/* to the agent server, so the browser talks to one origin (no CORS setup needed).
    proxy: { '/api': 'http://localhost:3001' },
  },
})