/* StormScope service worker — precache + runtime caching + Web Push.
   Built via vite-plugin-pwa injectManifest (generateSW can't add push handlers). */
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ url }) => url.origin === 'https://api.weather.gov',
  new NetworkFirst({
    cacheName: 'nws-api',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 })],
  })
)

// Radar tiles: timestamped URLs are immutable, so CacheFirst is safe. Tiles
// are requested with crossOrigin (RadarMap), so only real 200s are cached: a
// 503 for a frame IEM hasn't generated yet must not be stored as a tile.
registerRoute(
  ({ url }) => url.origin === 'https://mesonet.agron.iastate.edu' && url.pathname.includes('/cache/tile.py/'),
  new CacheFirst({
    cacheName: 'radar-tiles-v2',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 3600, purgeOnQuotaError: true }),
    ],
  })
)

registerRoute(
  ({ url }) => url.origin === 'https://services.swpc.noaa.gov',
  new NetworkFirst({
    cacheName: 'space-weather',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 900 })],
  })
)

// Basemap (src/components/DarkBasemap.jsx): requested with crossOrigin, so
// responses are real 200s, not opaque.
registerRoute(
  ({ url }) => url.host === 'server.arcgisonline.com' && url.pathname.includes('/MapServer/tile/'),
  new CacheFirst({
    cacheName: 'basemap-tiles',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 86400, purgeOnQuotaError: true }),
    ],
  })
)

// Retired caches: 'map-tiles' held CARTO tiles, which turned into "API KEY
// REQUIRED" images; 'radar-tiles' held opaque (no-cors) responses, which
// can't answer the CORS tile requests made now.
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all(['map-tiles', 'radar-tiles'].map(name => caches.delete(name))))
})

// ── Web Push ──

self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try { data = event.data.json() } catch { data = { title: 'StormScope', body: event.data.text() } }
  const options = {
    body: data.body || '',
    tag: data.tag || 'stormscope-alert',
    renotify: true,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(data.title || 'StormScope Weather', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
