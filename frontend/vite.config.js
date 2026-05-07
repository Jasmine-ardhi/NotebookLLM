import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/upload': 'http://localhost:3001',
      '/chat': 'http://localhost:3001',
      '/status': 'http://localhost:3001',
    }
  }
})
