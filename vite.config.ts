import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3005,
    host: '0.0.0.0',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-tooltip'],
          'v4': [
            './src/v4/V4Router',
            './src/v4/pages/HomePage',
            './src/v4/pages/ServicesPage',
            './src/v4/pages/MediaPage',
            './src/v4/pages/ControlsPage',
            './src/v4/pages/GamingPage',
            './src/v4/pages/KioskPage',
          ],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
