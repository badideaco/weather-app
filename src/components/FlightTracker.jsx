import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getNearbyFlights } from '../api'
import 'leaflet/dist/leaflet.css'

// Military callsign prefixes (US military, NATO, etc.)
const MIL_CALLSIGN_PREFIXES = [
  'RCH', 'REACH', 'EVAC', 'KING', 'DUKE', 'PEDRO', 'JOLLY', 'SKULL',
  'IRON', 'SPAR', 'DOOM', 'VIPER', 'COBRA', 'HAWK', 'RAPTOR', 'FURY',
  'BLADE', 'VALOR', 'NOBLE', 'FORGE', 'TOPCAT', 'CONVOY', 'RAIDR',
  'CRZR', 'TEAL', 'HUNT', 'KNIFE', 'PACK', 'METAL', 'TORCH',
  'SAM', 'EXEC', 'CODY', 'DECEE', 'TREK', 'GUSTO', 'BRAVO',
  'MOOSE', 'ROGUE', 'HAVOC', 'CHAOS', 'TOXIC', 'NIGHT',
]

const HELI_TYPES = [
  'H60', 'UH60', 'HH60', 'MH60', 'SH60', 'CH47', 'AH64', 'UH1',
  'OH58', 'CH53', 'MH53', 'V22', 'H47', 'H64', 'H1', 'R22', 'R44',
  'R66', 'EC35', 'EC45', 'EC55', 'EC30', 'AS50', 'AS55', 'A109',
  'A139', 'A149', 'B06', 'B212', 'B412', 'B429', 'B505', 'S76',
  'S92', 'MD52', 'MD50', 'MD60', 'MD90', 'BELL', 'S70',
]

function isHelicopter(f) {
  if (f.category === 'A7') return true
  const t = (f.type || '').toUpperCase()
  return HELI_TYPES.some(h => t.includes(h))
}

function isMilitary(f) {
  if (f.military) return true
  const call = (f.callsign || '').toUpperCase()
  return MIL_CALLSIGN_PREFIXES.some(p => call.startsWith(p))
}

function getFlightTag(f) {
  const mil = isMilitary(f)
  const heli = isHelicopter(f)
  if (mil && heli) return { label: 'MIL HELI', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' }
  if (mil) return { label: 'MILITARY', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' }
  if (heli) return { label: 'HELI', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' }
  return null
}

function createPlaneIcon(heading, onGround, tag) {
  const rotation = heading ?? 0
  const color = tag?.color || (onGround ? '#555570' : '#4fc3f7')
  const size = tag ? 24 : 20
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${rotation}deg);filter:${tag ? 'drop-shadow(0 0 4px ' + color + ')' : 'none'}">
      <path d="M12 2L4 14h3l1 8h8l1-8h3L12 2z" fill="${color}" stroke="#0a0a1a" stroke-width="1"/>
    </svg>`,
  })
}

function FlightMarkers({ flights }) {
  if (!flights?.length) return null
  return flights.map(f => {
    const tag = getFlightTag(f)
    return (
      <Marker
        key={f.icao24}
        position={[f.lat, f.lon]}
        icon={createPlaneIcon(f.heading, f.onGround, tag)}
      >
        <Popup className="flight-popup" maxWidth={220}>
          <div style={{ fontFamily: '-apple-system, system-ui, sans-serif', lineHeight: 1.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: tag?.color || '#4fc3f7' }}>
                {f.callsign || f.icao24}
              </span>
              {f.type && <span style={{ fontSize: 12, color: '#8888a8', fontWeight: 500 }}>{f.type}</span>}
            </div>
            {tag && (
              <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                color: tag.color, background: tag.bg, padding: '2px 8px', borderRadius: 6, marginBottom: 6 }}>
                {tag.label}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#c8c8d8' }}>
              {f.altitude != null && (
                <div>Alt: <strong style={{ color: '#e8e8ec' }}>{f.altitude.toLocaleString()} ft</strong></div>
              )}
              {f.velocity != null && (
                <div>Speed: <strong style={{ color: '#e8e8ec' }}>{f.velocity} mph</strong></div>
              )}
              {f.verticalRate != null && f.verticalRate !== 0 && (
                <div style={{ color: f.verticalRate > 0 ? '#66bb6a' : '#ff9800' }}>
                  {f.verticalRate > 0 ? '↗' : '↘'} {Math.abs(f.verticalRate)} ft/min
                </div>
              )}
            </div>
            {f.registration && (
              <div style={{ fontSize: 11, color: '#8888a8', marginTop: 4, fontFamily: 'monospace' }}>{f.registration}</div>
            )}
          </div>
        </Popup>
      </Marker>
    )
  })
}

function MapCenter({ lat, lon }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lon], map.getZoom())
  }, [lat, lon, map])
  return null
}

// Notification tracking
const NOTIF_KEY = 'stormscope-mil-seen'
const MIL_ALERT_KEY = 'stormscope-mil-alerts'

function getMilAlertEnabled() {
  return localStorage.getItem(MIL_ALERT_KEY) === 'true'
}

function getSeenMilFlights() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]') } catch { return [] }
}

function sendMilNotification(f, tag) {
  if (Notification.permission !== 'granted') return
  const emoji = tag.label.includes('HELI') ? '🚁' : '✈️'
  const body = [
    f.type && `Aircraft: ${f.type}`,
    f.altitude && `Altitude: ${f.altitude.toLocaleString()} ft`,
    f.velocity && `Speed: ${f.velocity} mph`,
    'Go outside and look up!',
  ].filter(Boolean).join('\n')

  try {
    new Notification(`${emoji} ${tag.label}: ${f.callsign || f.icao24}`, {
      body,
      icon: '/favicon.svg',
      tag: `mil-${f.icao24}`,
      requireInteraction: true,
    })
  } catch {}
}

export default function FlightTracker({ lat, lon }) {
  const [flights, setFlights] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [visible, setVisible] = useState(false)
  const [milAlerts, setMilAlerts] = useState(getMilAlertEnabled)
  const sectionRef = useRef(null)
  const fetchedRef = useRef(false)
  const seenMilRef = useRef(getSeenMilFlights())

  // Only fetch when section becomes visible
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fetchedRef.current) {
          setVisible(true)
          fetchedRef.current = true
        }
      },
      { rootMargin: '200px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const fetchFlights = useCallback(() => {
    setLoading(true)
    setError(null)
    getNearbyFlights(lat, lon)
      .then(data => {
        setFlights(data)

        // Military / helicopter alerts
        if (milAlerts && data?.length) {
          const interesting = data.filter(f => {
            const tag = getFlightTag(f)
            if (!tag) return false
            if (f.onGround) return false
            // Only alert once per flight
            const seen = seenMilRef.current
            if (seen.includes(f.icao24)) return false
            seen.push(f.icao24)
            // Keep last 100
            if (seen.length > 100) seenMilRef.current = seen.slice(-100)
            localStorage.setItem(NOTIF_KEY, JSON.stringify(seenMilRef.current))
            return true
          })
          interesting.forEach(f => sendMilNotification(f, getFlightTag(f)))
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [lat, lon, milAlerts])

  useEffect(() => {
    if (visible) fetchFlights()
  }, [visible, fetchFlights])

  // Auto-refresh every 15 seconds when visible
  useEffect(() => {
    if (!visible) return
    const interval = setInterval(fetchFlights, 15000)
    return () => clearInterval(interval)
  }, [visible, fetchFlights])

  // Background military scan (even when not scrolled to section)
  useEffect(() => {
    if (!milAlerts) return
    // Initial scan
    getNearbyFlights(lat, lon).then(data => {
      if (!data?.length) return
      data.filter(f => !f.onGround && getFlightTag(f)).forEach(f => {
        const seen = seenMilRef.current
        if (seen.includes(f.icao24)) return
        seen.push(f.icao24)
        localStorage.setItem(NOTIF_KEY, JSON.stringify(seen.slice(-100)))
        seenMilRef.current = seen.slice(-100)
        sendMilNotification(f, getFlightTag(f))
      })
    }).catch(() => {})
    // Scan every 60 seconds in background
    const bgScan = setInterval(() => {
      getNearbyFlights(lat, lon).then(data => {
        if (!data?.length) return
        data.filter(f => !f.onGround && getFlightTag(f)).forEach(f => {
          const seen = seenMilRef.current
          if (seen.includes(f.icao24)) return
          seen.push(f.icao24)
          localStorage.setItem(NOTIF_KEY, JSON.stringify(seen.slice(-100)))
          seenMilRef.current = seen.slice(-100)
          sendMilNotification(f, getFlightTag(f))
        })
      }).catch(() => {})
    }, 60000)
    return () => clearInterval(bgScan)
  }, [milAlerts, lat, lon])

  const toggleMilAlerts = async () => {
    if (milAlerts) {
      setMilAlerts(false)
      localStorage.setItem(MIL_ALERT_KEY, 'false')
      return
    }
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    if (perm === 'granted') {
      setMilAlerts(true)
      localStorage.setItem(MIL_ALERT_KEY, 'true')
      new Notification('🛩️ Military Aircraft Alerts Enabled', {
        body: 'You\'ll be notified when military aircraft or helicopters are nearby.',
        icon: '/favicon.svg',
      })
    }
  }

  const airborne = flights?.filter(f => !f.onGround) || []
  const milFlights = airborne.filter(f => getFlightTag(f))

  return (
    <section className="mb-6" ref={sectionRef}>
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em]">Nearby Flights</h2>
        <div className="flex items-center gap-2">
          {milFlights.length > 0 && (
            <span className="text-[10px] text-red-400 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {milFlights.length} military
            </span>
          )}
          <button
            onClick={toggleMilAlerts}
            className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${milAlerts ? 'bg-red-500/20 text-red-400' : 'bg-surface text-text-muted'}`}
            title={milAlerts ? 'Military alerts on' : 'Enable military aircraft alerts'}
          >
            🛩️
          </button>
          {flights && (
            <span className="text-text-muted text-xs">{airborne.length} airborne</span>
          )}
        </div>
      </div>
      <div className="glass-card overflow-hidden">
        <div className="h-[300px] relative">
          {!visible ? (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              Scroll to load flight data
            </div>
          ) : (
            <MapContainer
              center={[lat, lon]}
              zoom={9}
              minZoom={5}
              maxZoom={13}
              bounceAtZoomLimits={false}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
              attributionControl={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
              />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
                zIndex={20}
              />
              <FlightMarkers flights={flights} />
              <MapCenter lat={lat} lon={lon} />
              <CircleMarker
                center={[lat, lon]}
                radius={6}
                pathOptions={{ color: '#4fc3f7', fillColor: '#4fc3f7', fillOpacity: 0.9, weight: 2 }}
              />
              <CircleMarker
                center={[lat, lon]}
                radius={14}
                pathOptions={{ color: '#4fc3f7', fillColor: '#4fc3f7', fillOpacity: 0.15, weight: 1 }}
              />
            </MapContainer>
          )}
          {visible && loading && !flights && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/50 z-[1000] pointer-events-none">
              <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {visible && error && !flights && (
            <div className="absolute bottom-2 left-2 right-2 z-[1000] bg-surface/90 backdrop-blur rounded-lg px-3 py-2 text-center">
              <span className="text-text-muted text-xs">Flight data unavailable</span>
              <button onClick={fetchFlights} className="text-accent text-xs ml-2 underline">Retry</button>
            </div>
          )}
        </div>

        {/* Flight list — military/heli first, then regular */}
        {airborne.length > 0 && (
          <div className="max-h-48 overflow-y-auto border-t border-border/30">
            {[...milFlights, ...airborne.filter(f => !getFlightTag(f))].slice(0, 20).map(f => {
              const tag = getFlightTag(f)
              return (
                <div key={f.icao24} className={`flex items-center gap-3 px-4 py-2 border-b border-border/20 last:border-0 ${tag ? 'bg-white/[0.02]' : ''}`}>
                  <span className={`text-xs font-mono w-16 flex-shrink-0 ${tag ? `font-bold` : ''}`} style={{ color: tag?.color || '#4fc3f7' }}>
                    {f.callsign || f.icao24}
                  </span>
                  {tag && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: tag.color, background: tag.bg, letterSpacing: '0.03em' }}>
                      {tag.label}
                    </span>
                  )}
                  {f.type && <span className="text-text-muted text-[10px] w-10 flex-shrink-0">{f.type}</span>}
                  <span className="text-text-muted text-xs flex-1">
                    {f.altitude?.toLocaleString()} ft
                  </span>
                  <span className="text-text-muted text-xs">
                    {f.velocity} mph
                  </span>
                  {f.verticalRate != null && f.verticalRate !== 0 && (
                    <span className={`text-xs ${f.verticalRate > 0 ? 'text-green-400' : 'text-orange-400'}`}>
                      {f.verticalRate > 0 ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
