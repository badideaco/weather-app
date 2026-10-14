import { useState, useEffect, useCallback } from 'react'

// weather-push Lambda Function URL (see server/). The token is anti-spam for
// the subscribe endpoints, not a secret — same pattern as infra-map.
export const PUSH_API_BASE = 'https://5k7qfuej6544m6hf5wxz7fc6mq0nxgit.lambda-url.us-east-2.on.aws'
const PUSH_AUTH_TOKEN = 'SjxcdEqqcgCTVlKy0mhbMSdBkAmvllm5pLVZeIMeAxo'

const configured = PUSH_API_BASE.startsWith('https://')

export function usePushNotifications() {
  const [subscribed, setSubscribed] = useState(false)
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const ok = configured && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSupported(ok)
    if (ok) reRegister()
  }, [])

  // Re-register on every app open: refreshes the backend TTL and keeps the
  // stored lat/lon current if the user moved
  async function reRegister() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) return
      const loc = getStoredLocation()
      if (!loc) { setSubscribed(true); return }
      await fetch(`${PUSH_API_BASE}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PUSH_AUTH_TOKEN}` },
        body: JSON.stringify({ subscription: sub.toJSON(), lat: loc.lat, lon: loc.lon }),
      })
      setSubscribed(true)
    } catch (e) {
      console.warn('Push re-register failed:', e.message)
    }
  }

  const subscribe = useCallback(async (lat, lon) => {
    if (!supported) return false
    setLoading(true)
    try {
      // Must be called from a user gesture (iOS requirement)
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setLoading(false); return false }

      const keyResp = await fetch(`${PUSH_API_BASE}/push/vapid-key`)
      const { publicKey } = await keyResp.json()

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const resp = await fetch(`${PUSH_API_BASE}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PUSH_AUTH_TOKEN}` },
        body: JSON.stringify({ subscription: sub.toJSON(), lat, lon }),
      })
      if (resp.ok) {
        setSubscribed(true)
        setLoading(false)
        return true
      }
    } catch (e) {
      console.error('Push subscribe failed:', e)
    }
    setLoading(false)
    return false
  }, [supported])

  // Move an existing subscription to a new location (the server upserts by
  // endpoint). Without this, alerts kept following the old location until the
  // next app open.
  const updateLocation = useCallback(async (lat, lon) => {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) return
      await fetch(`${PUSH_API_BASE}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PUSH_AUTH_TOKEN}` },
        body: JSON.stringify({ subscription: sub.toJSON(), lat, lon }),
      })
    } catch (e) {
      console.warn('Push location update failed:', e.message)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        fetch(`${PUSH_API_BASE}/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PUSH_AUTH_TOKEN}` },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch (e) {
      console.error('Push unsubscribe failed:', e)
    }
  }, [])

  return { subscribed, supported, loading, subscribe, unsubscribe, updateLocation }
}

function getStoredLocation() {
  try { return JSON.parse(localStorage.getItem('stormscope-location')) } catch { return null }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i)
  return arr
}
