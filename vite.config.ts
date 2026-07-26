import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH lets the same build serve from a subpath (GitHub Pages) or the root.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'GamesTable',
        short_name: 'GamesTable',
        description: 'Track the games you play, plan to play, and want to watch.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f3f2f7',
        theme_color: '#f3f2f7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\/api\/games.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'games-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/(media\.rawg\.io|.*\.akamai\.steamstatic\.com|cdn\.cloudflare\.steamstatic\.com)\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-covers',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    // On Vercel /api/games is same-origin. Without this the dev server would happily
    // serve api/games.js as a static file and the client would parse source as JSON.
    proxy: {
      '/api': {
        target: process.env.API_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: { host: true },
})
