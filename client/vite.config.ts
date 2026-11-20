import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits until you tap "Refresh" (see components/PwaUpdater.tsx)
      registerType: 'prompt',
      // Registration happens in PwaUpdater, not in an injected inline script (the CSP blocks inline scripts)
      injectRegister: false,
      manifest: {
        name: 'Daily Tracker',
        short_name: 'Tracker',
        description: 'Your daily check-in for body, mind and learning.',
        theme_color: '#467553', // sage green (the app's primary colour)
        background_color: '#f8f6f1', // warm off-white
        display: 'standalone',
        start_url: '/today',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the app shell is cached: the page, JS, CSS, icons and fonts.
        globPatterns: ['**/*.{html,js,css,svg,png,ico,woff,woff2}'],
        // Opening any page offline or while the server wakes up shows the cached shell...
        navigateFallback: '/index.html',
        // ...but never for the API. There's no runtimeCaching at all, so /api responses
        // (private data that must always be fresh) are never stored by the service worker.
        navigateFallbackDenylist: [/^\/api(\/|$)/],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
      // No service worker during development, so you always see your latest code
      devOptions: { enabled: false },
    }),
  ],
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
