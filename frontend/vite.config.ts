import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    host: '0.0.0.0', // Allow external connections (for Docker)
    port: 5173,      // Match our standard port
    strictPort: true,
    watch: {
      usePolling: true, // Better for Docker environments
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
})
