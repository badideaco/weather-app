import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Inline plugin to stub satellite.js WASM runtime imports that use top-level await
// (breaks Vite PWA service worker iife bundle). We only use the pure-JS SGP4 path.
function stubSatelliteWasm() {
  const WASM_RUNTIME = 'node_modules/satellite.js/dist/wasm/runtimes/index.js'
  return {
    name: 'stub-satellite-wasm',
    load(id) {
      if (id.includes(WASM_RUNTIME)) {
        return 'export function createSingleThreadRuntime() { throw new Error("WASM not available") }\n' +
               'export function createMultiThreadRuntime() { throw new Error("WASM not available") }\n'
      }
    },
  }
}

export default defineConfig({
  optimizeDeps: {
    exclude: ['satellite.js'],
  },
  plugins: [
    stubSatelliteWasm(),
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest so the SW can handle Web Push (generateSW cannot).
      // Runtime caching now lives in src/sw.js.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'],
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
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      }
    })
  ]
})
