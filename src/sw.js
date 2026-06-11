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

// Tile requests are no-cors (opaque, status 0) — CacheableResponsePlugin is
// required or CacheFirst silently caches nothing.
const opaqueOk = new CacheableResponsePlugin({ statuses: [0, 200] })

registerRoute(
  ({ url }) => url.origin === 'https://api.weather.gov',
  new NetworkFirst({
    cacheName: 'nws-api',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 })],
  })
)

// Radar tiles: timestamped URLs are immutable, so CacheFirst is safe
registerRoute(
  ({ url }) => url.origin === 'https://mesonet.agron.iastate.edu' && url.pathname.includes('/cache/tile.py/'),
  new CacheFirst({
    cacheName: 'radar-tiles',
    plugins: [opaqueOk, new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 3600 })],
  })
)

registerRoute(
  ({ url }) => url.origin === 'https://services.swpc.noaa.gov',
  new NetworkFirst({
    cacheName: 'space-weather',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 900 })],
  })
)

registerRoute(
  ({ url }) => /^[abcd]\.basemaps\.cartocdn\.com$/.test(url.host),
  new CacheFirst({
    cacheName: 'map-tiles',
    plugins: [opaqueOk, new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 86400 })],
  })
)

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
