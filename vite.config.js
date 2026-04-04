import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'StormScope Weather',
        short_name: 'StormScope',
        description: 'Weather, radar, space weather, astronomy & flight tracking',
        theme_color: '#0a0a1a',
        background_color: '#0a0a1a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.weather\.gov\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'nws-api', expiration: { maxEntries: 50, maxAgeSeconds: 300 } }
          },
          {
            urlPattern: /^https:\/\/tilecache\.rainviewer\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'radar-tiles', expiration: { maxEntries: 200, maxAgeSeconds: 600 } }
          },
          {
            urlPattern: /^https:\/\/services\.swpc\.noaa\.gov\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'space-weather', expiration: { maxEntries: 20, maxAgeSeconds: 900 } }
          },
          {
            urlPattern: /^https:\/\/[abc]\.basemaps\.cartocdn\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 500, maxAgeSeconds: 86400 } }
          }
        ]
      }
    })
  ]
})
