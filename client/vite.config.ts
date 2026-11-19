import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // "@/components/ui/button" means "src/components/ui/button".
    // "/src" is relative to the project root, so "@/..." imports get exactly the same file paths
    // as relative imports. (An absolute path here can differ in drive-letter case on Windows,
    // "c:\" vs "C:\", which makes Vite bundle a second copy of React and breaks every page.)
    alias: [{ find: /^@\//, replacement: '/src/' }],
  },
  server: {
    // Forward any request starting with /api to the Express server
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
