import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { MapContainer, CircleMarker, Polygon, Tooltip, useMap } from 'react-leaflet'
import DarkBasemap from './DarkBasemap'
import L from 'leaflet'
import { getRadarFrames, getStormWarnings, pointInPolygons } from '../api'
import { formatTime, relativeLabel } from '../timezone'
import 'leaflet/dist/leaflet.css'

// ── Radar tile overlays (one layer per frame, opacity toggle) ──
// All frames mount as tile layers once; animation toggles opacity, never
// refetching tiles. Frame URLs are timestamped (immutable), so repeat loops
// come from cache. Memory stays bounded on iOS Safari (the old OOM driver)
// via maxNativeZoom — the composite has no real detail past z8, so overzoom
// upscales instead of fetching — plus keepBuffer 0. crossOrigin (IEM sends
// ACAO *) lets the service worker see real status codes, so a 503 for a
// not-yet-generated frame is never cached as a tile.
const RADAR_OPACITY = 0.65
const RADAR_REFRESH_MS = 5 * 60 * 1000

function RadarOverlay({ frames, host, currentFrame }) {
  const map = useMap()
  const layersRef = useRef(new Map()) // path -> L.tileLayer

  // Sync layers to the frame list: add new frames, drop expired ones.
  // On the 5-min data refresh only ~1 layer changes; the rest stay warm.
  useEffect(() => {
    if (!map || !frames?.length) return
    const layers = layersRef.current
    const wanted = new Set(frames.map(f => f.path))

    for (const [path, layer] of layers) {
      if (!wanted.has(path)) { map.removeLayer(layer); layers.delete(path) }
    }
    for (const f of frames) {
      if (!layers.has(f.path)) {
        const layer = L.tileLayer(`${host}${f.path}/{z}/{x}/{y}.png`, {
          opacity: 0,
          zIndex: 10,
          maxNativeZoom: 8,
          keepBuffer: 0,
          updateWhenZooming: false,
          updateWhenIdle: true,
          crossOrigin: true,
        })
        layer.addTo(map)
        layers.set(f.path, layer)
      }
    }
  }, [map, frames, host])

  // Show only the active frame
  useEffect(() => {
    if (!map || !frames?.length) return
    const active = frames[currentFrame]?.path
    for (const [path, layer] of layersRef.current) {
      layer.setOpacity(path === active ? RADAR_OPACITY : 0)
    }
  }, [map, frames, currentFrame])

  // Remove all layers on unmount
  useEffect(() => {
    if (!map) return
    const layers = layersRef.current
    return () => {
      for (const layer of layers.values()) map.removeLayer(layer)
      layers.clear()
    }
  }, [map])

  return null
}

// ── Lightning strikes from Blitzortung's public websocket ──
// The feed is worldwide (~8 strikes/s); only strikes inside the visible map
// are drawn. Until Oct 2026 this subscribed with {a: 418}, which the servers
// now ignore, and parsed messages as plain JSON, but each message is
// LZW-compressed, so nothing was ever drawn while "Lightning Live" showed.
// Blitzortung data is free for private, non-commercial use.
// The worldwide stream is ~7 messages/s (~40 MB/hour uncompressed), so the
// socket is open only while the radar is on screen and the page is visible.
const LIGHTNING_SERVERS = ['wss://ws1.blitzortung.org/', 'wss://ws8.blitzortung.org/']
const LIGHTNING_SUBSCRIBE = JSON.stringify({ a: 111 })
const STRIKE_KEEP_MS = 15 * 60 * 1000
const FEED_STALL_MS = 30 * 1000 // no message for this long = dead feed, try next server
const MAX_FLASHES = 25          // concurrent expanding-ring animations
const MAX_DOTS = 3000           // outbreak cap: oldest dots drop first
const LIGHTNING_PREF_KEY = 'stormscope-lightning'

function lzwDecode(s) {
  const dict = {}
  const chars = s.split('')
  let cur = chars[0]
  let prev = cur
  const out = [cur]
  let code = 256
  for (let i = 1; i < chars.length; i++) {
    const n = chars[i].charCodeAt(0)
    const entry = n < 256 ? chars[i] : dict[n] ? dict[n] : prev + cur
    out.push(entry)
    cur = entry.charAt(0)
    dict[code++] = prev + cur
    prev = entry
  }
  return out.join('')
}

function strikeColor(ageFrac) {
  if (ageFrac < 0.2) return '#fde047'
  if (ageFrac < 0.5) return '#fb923c'
  return '#ef4444'
}

function LightningLayer({ onStatus, active }) {
  const map = useMap()
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus
  const activeRef = useRef(active)
  const updatePausedRef = useRef(null)

  useEffect(() => {
    if (!map) return
    const renderer = L.canvas({ padding: 0.25 })
    const dots = L.layerGroup().addTo(map)
    const strikes = [] // { dot, time }, oldest first
    const flashes = new Set()
    let ws = null
    let serverIdx = 0
    let reconnectTimer = null
    let disposed = false
    let paused = document.hidden || !activeRef.current
    let lastMsg = 0
    let openedAt = 0

    function addStrike(lat, lon) {
      if (!map.getBounds().pad(0.25).contains([lat, lon])) return
      const dot = L.circleMarker([lat, lon], {
        renderer, radius: 2.5, stroke: false, fillColor: strikeColor(0), fillOpacity: 0.95, interactive: false,
      }).addTo(dots)
      strikes.push({ dot, time: Date.now() })
      if (strikes.length > MAX_DOTS) dots.removeLayer(strikes.shift().dot)

      if (flashes.size >= MAX_FLASHES) return
      const ring = L.circleMarker([lat, lon], {
        radius: 4, color: '#fff', fillColor: '#ffeb3b', fillOpacity: 0.9, weight: 1, interactive: false,
      }).addTo(map)
      let size = 4
      const flash = { ring, timer: null }
      flash.timer = setInterval(() => {
        size += 1
        ring.setRadius(size)
        ring.setStyle({ fillOpacity: Math.max(0, 0.9 - (size - 4) * 0.06), opacity: Math.max(0, 1 - (size - 4) * 0.06) })
        if (size > 18) { clearInterval(flash.timer); map.removeLayer(ring); flashes.delete(flash) }
      }, 80)
      flashes.add(flash)
    }

    function connect() {
      if (disposed || paused) return
      onStatusRef.current?.({ state: 'connecting', count: strikes.length })
      try {
        ws = new WebSocket(LIGHTNING_SERVERS[serverIdx % LIGHTNING_SERVERS.length])
      } catch {
        serverIdx++
        reconnectTimer = setTimeout(connect, 5000)
        return
      }
      openedAt = Date.now()
      ws.onopen = () => ws.send(LIGHTNING_SUBSCRIBE)
      ws.onmessage = (e) => {
        lastMsg = Date.now()
        try {
          const d = JSON.parse(lzwDecode(String(e.data)))
          if (typeof d.lat === 'number' && typeof d.lon === 'number') addStrike(d.lat, d.lon)
        } catch { /* one bad message: skip it */ }
      }
      ws.onerror = () => {}
      ws.onclose = () => {
        ws = null
        if (disposed || paused) return
        serverIdx++ // rotate to the other server
        reconnectTimer = setTimeout(connect, 5000)
      }
    }

    function disconnect() {
      clearTimeout(reconnectTimer)
      if (ws) { ws.onclose = null; ws.close(); ws = null }
    }

    // Drop the socket while the page is hidden (iOS kills it anyway) or the
    // radar is scrolled off screen; dots already drawn stay and keep aging
    function updatePaused() {
      const next = document.hidden || !activeRef.current
      if (next === paused) return
      paused = next
      if (paused) disconnect()
      else if (!ws) connect()
    }
    updatePausedRef.current = updatePaused
    document.addEventListener('visibilitychange', updatePaused)
    connect()

    // Age dots yellow → orange → red, drop them after 15 min, detect a stalled
    // feed, and report status for the badge
    const tick = setInterval(() => {
      const now = Date.now()
      while (strikes.length && now - strikes[0].time > STRIKE_KEEP_MS) dots.removeLayer(strikes.shift().dot)
      for (const s of strikes) {
        const age = (now - s.time) / STRIKE_KEEP_MS
        s.dot.setStyle({ fillColor: strikeColor(age), fillOpacity: 0.95 - age * 0.6 })
      }
      const open = ws?.readyState === WebSocket.OPEN
      if (open && now - Math.max(lastMsg, openedAt) > FEED_STALL_MS) ws.close() // onclose rotates servers
      const live = open && now - lastMsg < FEED_STALL_MS
      onStatusRef.current?.({ state: live ? 'live' : paused ? 'paused' : open || ws ? 'connecting' : 'offline', count: strikes.length })
    }, 5000)

    return () => {
      disposed = true
      updatePausedRef.current = null
      document.removeEventListener('visibilitychange', updatePaused)
      disconnect()
      clearInterval(tick)
      for (const f of flashes) { clearInterval(f.timer); map.removeLayer(f.ring) }
      flashes.clear()
      map.removeLayer(dots)
      map.removeLayer(renderer) // getRenderer adds it to the map; leaving it leaks a canvas per toggle
    }
  }, [map])

  useEffect(() => {
    activeRef.current = active
    updatePausedRef.current?.()
  }, [active])

  return null
}

// ── Warning polygons ──
// IEM's storm-based warnings (every active TO/SV/EW/FF/SQ warning in the US),
// so storms heading toward you show before they cover your point. If that
// feed fails, falls back to the NWS alerts at the user's point.
const WARNING_COLORS = { TO: '#ef4444', EW: '#f97316', SV: '#facc15', FF: '#22c55e', SQ: '#38bdf8' }
const WARNING_SHORT = { TO: 'Tornado', EW: 'Extreme wind', SV: 'Severe T-storm', FF: 'Flash flood', SQ: 'Snow squall' }
const SBW_EVENT_NAMES = new Set(['Tornado Warning', 'Severe Thunderstorm Warning', 'Extreme Wind Warning', 'Flash Flood Warning', 'Snow Squall Warning'])

// Constant style objects + memo: react-leaflet calls setStyle whenever
// pathOptions changes identity, which an inline object did on every 350 ms
// animation frame for every polygon
const WARNING_STYLES = Object.fromEntries(Object.entries(WARNING_COLORS).map(([t, c]) =>
  [t, { color: c, fillColor: c, fillOpacity: t === 'TO' ? 0.18 : 0.08, weight: 2 }]))

const WarningPolygons = memo(function WarningPolygons({ warnings }) {
  return warnings.map(w => (
    <Polygon
      key={w.id}
      positions={w.polygon}
      pathOptions={WARNING_STYLES[w.type]}
    >
      <Tooltip sticky className="dark-tooltip">
        <span style={{ color: '#e8e8ec', fontSize: 12 }}>
          {w.name}{w.expires ? ` until ${formatTime(new Date(w.expires))}` : ''}
        </span>
      </Tooltip>
    </Polygon>
  ))
})

const sevColors = { Extreme: '#ef4444', Severe: '#f97316', Moderate: '#eab308', Minor: '#3b82f6' }
const SEV_STYLES = Object.fromEntries(['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'].map(sev => {
  const c = sevColors[sev] || '#eab308'
  return [sev, { color: c, fillColor: c, fillOpacity: 0.1, weight: 2, dashArray: sev === 'Minor' ? '5 5' : undefined }]
}))

const StormPolygons = memo(function StormPolygons({ alerts }) {
  if (!alerts?.length) return null
  return alerts
    .filter(a => a.polygon?.length > 0)
    .map((alert, i) => (
      <Polygon
        key={alert.id || i}
        positions={alert.polygon}
        pathOptions={SEV_STYLES[alert.severity] || SEV_STYLES.Unknown}
      >
        <Tooltip sticky className="dark-tooltip">
          <span style={{ color: '#e8e8ec', fontSize: 12 }}>{alert.event}</span>
        </Tooltip>
      </Polygon>
    ))
})

// ── Reflectivity legend (IEM N0Q ramp, sampled at 10–70 dBZ) ──
const DBZ_GRADIENT = 'linear-gradient(to right, #4568a6 0%, #43d67e 17%, #0b840e 33%, #ffe200 50%, #ffac00 58%, #f80000 67%, #aa0000 75%, #ffeaff 83%, #f960fa 92%, #a400f7 100%)'

function RadarLegend({ warningTypes }) {
  return (
    <div className="px-4 pb-3 bg-bg/60">
      <div className="h-1.5 rounded-full" style={{ background: DBZ_GRADIENT }} />
      <div className="flex justify-between text-[9px] text-text-muted mt-1">
        <span>Light</span><span>Moderate</span><span>Heavy</span><span>Hail</span>
      </div>
      {warningTypes.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {warningTypes.map(t => (
            <span key={t} className="flex items-center gap-1 text-[9px] text-text-muted">
              <span className="inline-block w-2.5 h-2.5 rounded-sm border" style={{ borderColor: WARNING_COLORS[t], backgroundColor: `${WARNING_COLORS[t]}33` }} />
              {WARNING_SHORT[t]} warning
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ──
export default function RadarMap({ lat, lon, alerts, refreshKey }) {
  const [radarData, setRadarData] = useState(null)
  const [warnings, setWarnings] = useState(null) // null = feed unavailable
  const [currentFrame, setCurrentFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [showLightning, setShowLightning] = useState(() => {
    try { return localStorage.getItem(LIGHTNING_PREF_KEY) !== 'off' } catch { return true }
  })
  const [radarInView, setRadarInView] = useState(true)
  const [lightning, setLightning] = useState({ state: 'connecting', count: 0 })
  const intervalRef = useRef(null)
  const containerRef = useRef(null)
  const dwellRef = useRef(0)

  const loadRadar = useCallback((initial) => {
    getRadarFrames()
      .then(data => {
        if (!data?.frames?.length) return
        setRadarData(data)
        if (initial) setCurrentFrame(data.frames.length - 1)
      })
      .catch(() => {})
      .finally(() => { if (initial) setLoading(false) })
    getStormWarnings().then(setWarnings).catch(() => setWarnings(null))
  }, [])

  // Initial load, then every 5 min. Frame URLs are timestamped, so a refresh
  // only adds the newest frame. refreshKey (app reopen / manual refresh)
  // forces a reload, since timers stall while iOS has the app in the background.
  const loadedRef = useRef(false)
  useEffect(() => {
    loadRadar(!loadedRef.current)
    loadedRef.current = true
    const timer = setInterval(() => loadRadar(false), RADAR_REFRESH_MS)
    return () => clearInterval(timer)
  }, [loadRadar, refreshKey])

  // A new or cancelled alert at the user's point: refresh the warning polygons
  // now instead of waiting up to 5 min for the radar timer
  const alertIds = (alerts || []).map(a => a.id).sort().join('|')
  const alertIdsRef = useRef(alertIds)
  useEffect(() => {
    if (alertIds === alertIdsRef.current) return
    alertIdsRef.current = alertIds
    getStormWarnings().then(setWarnings).catch(() => setWarnings(null))
  }, [alertIds])

  // Lightning streams only while the radar is on screen
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => setRadarInView(entry.isIntersecting), { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const toggleLightning = useCallback(() => {
    setShowLightning(prev => {
      try { localStorage.setItem(LIGHTNING_PREF_KEY, prev ? 'off' : 'on') } catch { /* private mode */ }
      return !prev
    })
  }, [])

  const togglePlay = useCallback(() => setPlaying(prev => !prev), [])

  // Animation loop with a dwell on the newest frame
  useEffect(() => {
    if (!playing || !radarData?.frames?.length) {
      clearInterval(intervalRef.current)
      return
    }

    const totalFrames = radarData.frames.length
    const DWELL_TICKS = 4 // Extra ticks to pause on latest frame (4 × 350ms = 1.4s dwell)
    dwellRef.current = 0

    intervalRef.current = setInterval(() => {
      setCurrentFrame(prev => {
        if (prev === totalFrames - 1 && dwellRef.current < DWELL_TICKS) {
          dwellRef.current++
          return prev
        }
        dwellRef.current = 0
        return (prev + 1) % totalFrames
      })
    }, 350)

    return () => clearInterval(intervalRef.current)
  }, [playing, radarData])

  // Fullscreen — CSS-based (iOS Safari doesn't support requestFullscreen on divs)
  const toggleFullscreen = useCallback(() => {
    setFullscreen(f => !f)
  }, [])

  const onLightningStatus = useCallback((next) => {
    setLightning(prev => (prev.state === next.state && prev.count === next.count ? prev : next))
  }, [])

  const currentFrameData = radarData?.frames?.[currentFrame]
  const frameTime = currentFrameData
    ? formatTime(new Date(currentFrameData.time * 1000))
    : ''
  const relTime = currentFrameData ? relativeLabel(currentFrameData.time) : ''

  // A point alert's polygon is skipped only when the IEM feed already has a
  // warning of that type covering the user, so nothing is drawn twice but a
  // warning issued since the last IEM load still shows.
  const pointAlerts = useMemo(() => (alerts || []).filter(a => !(
    warnings && SBW_EVENT_NAMES.has(a.event) &&
    warnings.some(w => w.name === a.event && pointInPolygons(lat, lon, w.polygon))
  )), [alerts, warnings, lat, lon])
  // Legend keys only for warnings near the user (roughly the default map view),
  // not for every warning in the country
  const warningTypes = useMemo(() => {
    const near = (warnings || []).filter(w =>
      w.polygon.some(rings => rings[0]?.some(([la, lo]) => Math.abs(la - lat) < 3 && Math.abs(lo - lon) < 4)))
    return Object.keys(WARNING_COLORS).filter(t => near.some(w => w.type === t))
  }, [warnings, lat, lon])

  const lightningBadge = {
    live: { text: `Lightning live${lightning.count ? ` · ${lightning.count} in 15 min` : ''}`, cls: 'text-yellow-400', dot: 'bg-yellow-400 animate-pulse' },
    connecting: { text: 'Lightning connecting…', cls: 'text-text-muted', dot: 'bg-text-muted' },
    paused: { text: 'Lightning paused', cls: 'text-text-muted', dot: 'bg-text-muted' },
    offline: { text: 'Lightning offline', cls: 'text-text-muted', dot: 'bg-red-400' },
  }[lightning.state]

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em]">Radar</h2>
        <div className="flex items-center gap-2">
          {showLightning && lightningBadge && (
            <span className={`text-[10px] flex items-center gap-1 ${lightningBadge.cls}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${lightningBadge.dot}`} />
              {lightningBadge.text}
            </span>
          )}
          <button
            onClick={toggleLightning}
            className={`text-xs px-2 py-0.5 rounded ${showLightning ? 'bg-yellow-400/20 text-yellow-400' : 'bg-surface text-text-muted'}`}
            title={showLightning ? 'Hide lightning' : 'Show lightning'}
          >⚡</button>
        </div>
      </div>
      <div
        ref={containerRef}
        className={`glass-card overflow-hidden ${fullscreen ? 'fixed inset-0 z-[9999] rounded-none border-0' : ''}`}
      >
        <div className={fullscreen ? 'h-[calc(100%-110px)]' : 'h-[350px]'} style={{ position: 'relative' }}>
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <MapContainer
              center={[lat, lon]}
              zoom={8}
              minZoom={5}
              maxZoom={12}
              bounceAtZoomLimits={false}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
              attributionControl={false}
            >
              <DarkBasemap />
              {radarData && <RadarOverlay frames={radarData.frames} host={radarData.host} currentFrame={currentFrame} />}
              {showLightning && <LightningLayer onStatus={onLightningStatus} active={radarInView} />}
              {warnings && <WarningPolygons warnings={warnings} />}
              <StormPolygons alerts={pointAlerts} />
              <CircleMarker center={[lat, lon]} radius={6} pathOptions={{ color: '#4fc3f7', fillColor: '#4fc3f7', fillOpacity: 0.9, weight: 2 }} />
              <CircleMarker center={[lat, lon]} radius={14} pathOptions={{ color: '#4fc3f7', fillColor: '#4fc3f7', fillOpacity: 0.15, weight: 1 }} />
            </MapContainer>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-3 bg-bg/60">
          <div className="flex items-center gap-3">
            <button onClick={togglePlay}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors flex-shrink-0"
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>

            {/* Scrubber: one dot per frame, newest frame emphasised */}
            {radarData && (
              <div className="flex-1 relative">
                <input type="range" min={0} max={(radarData.frames.length || 1) - 1} value={currentFrame}
                  onChange={e => { setCurrentFrame(parseInt(e.target.value)); setPlaying(false); dwellRef.current = 0 }}
                  className="w-full accent-accent h-1 relative z-10"
                />
                <div className="flex items-center mt-1 px-0.5 h-2" style={{ gap: 0 }}>
                  {radarData.frames.map((_, i) => (
                    <div key={i} className="flex-1 flex justify-center">
                      <div className={`rounded-full transition-all duration-150 ${
                        i === currentFrame ? 'w-2 h-2 bg-accent' :
                        i === radarData.frames.length - 1 ? 'w-1.5 h-1.5 bg-text' :
                        'w-1 h-1 bg-text-muted/30'
                      }`} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col items-end flex-shrink-0 min-w-[5.5rem]">
              <span className="text-xs text-text-dim leading-tight">{frameTime}</span>
              <span className="text-[10px] text-text-muted leading-tight">{relTime}</span>
            </div>

            <button onClick={toggleFullscreen}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface text-text-muted hover:text-text transition-colors flex-shrink-0"
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen radar'}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                {fullscreen ? (
                  <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
                ) : (
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                )}
              </svg>
            </button>
          </div>
        </div>
        <RadarLegend warningTypes={warningTypes} />
      </div>
    </section>
  )
}
