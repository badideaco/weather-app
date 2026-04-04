import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polygon, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getRadarFrames } from '../api'
import 'leaflet/dist/leaflet.css'

// ── Radar tile overlay (swaps on frame change) ──
function RadarOverlay({ frames, host, currentFrame }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (!frames?.length || !map) return
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    const frame = frames[currentFrame]
    if (!frame) return
    const tileUrl = `${host}${frame.path}/512/{z}/{x}/{y}/6/1_1.png`
    layerRef.current = L.tileLayer(tileUrl, { opacity: 0.65, zIndex: 10, tileSize: 512, zoomOffset: -1 })
    layerRef.current.addTo(map)
    return () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null } }
  }, [map, frames, host, currentFrame])

  return null
}

// ── Lightning strikes from Blitzortung websocket ──
function LightningLayer() {
  const map = useMap()
  const strikesRef = useRef([])
  const wsRef = useRef(null)
  const markersRef = useRef([])

  useEffect(() => {
    if (!map) return
    let reconnectTimer = null

    function connect() {
      try {
        const ws = new WebSocket('wss://ws1.blitzortung.org/')
        wsRef.current = ws

        ws.onopen = () => {
          // Subscribe to North America region
          ws.send(JSON.stringify({ a: 418 }))
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.lat != null && data.lon != null) {
              const strike = { lat: data.lat, lon: data.lon, time: Date.now() }
              strikesRef.current.push(strike)

              // Add visual marker
              const circle = L.circleMarker([data.lat, data.lon], {
                radius: 4,
                color: '#fff',
                fillColor: '#ffeb3b',
                fillOpacity: 0.9,
                weight: 1,
              }).addTo(map)

              // Expand animation
              let size = 4
              const expand = setInterval(() => {
                size += 1
                circle.setRadius(size)
                circle.setStyle({ fillOpacity: Math.max(0, 0.9 - (size - 4) * 0.06), opacity: Math.max(0, 1 - (size - 4) * 0.06) })
                if (size > 18) { clearInterval(expand); map.removeLayer(circle) }
              }, 80)

              markersRef.current.push({ circle, expand })
            }
          } catch {}
        }

        ws.onerror = () => {}
        ws.onclose = () => {
          // Reconnect after 5 seconds
          reconnectTimer = setTimeout(connect, 5000)
        }
      } catch {}
    }

    connect()

    // Cleanup old strikes every 30 seconds
    const cleanup = setInterval(() => {
      const cutoff = Date.now() - 60000
      strikesRef.current = strikesRef.current.filter(s => s.time > cutoff)
    }, 30000)

    return () => {
      if (wsRef.current) wsRef.current.close()
      clearTimeout(reconnectTimer)
      clearInterval(cleanup)
      markersRef.current.forEach(m => {
        clearInterval(m.expand)
        if (map.hasLayer(m.circle)) map.removeLayer(m.circle)
      })
    }
  }, [map])

  return null
}

// ── Storm warning polygons from NWS alerts ──
function StormPolygons({ alerts }) {
  if (!alerts?.length) return null

  const sevColors = {
    Extreme: '#ef4444',
    Severe: '#f97316',
    Moderate: '#eab308',
    Minor: '#3b82f6',
  }

  return alerts
    .filter(a => a.polygon?.length > 0)
    .map((alert, i) => (
      <Polygon
        key={i}
        positions={alert.polygon}
        pathOptions={{
          color: sevColors[alert.severity] || '#eab308',
          fillColor: sevColors[alert.severity] || '#eab308',
          fillOpacity: 0.1,
          weight: 2,
          dashArray: alert.severity === 'Minor' ? '5 5' : undefined,
        }}
      >
        <Tooltip sticky className="dark-tooltip">
          <span style={{ color: '#e8e8ec', fontSize: 12 }}>{alert.event}</span>
        </Tooltip>
      </Polygon>
    ))
}

// ── Main component ──
export default function RadarMap({ lat, lon, alerts }) {
  const [radarData, setRadarData] = useState(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [showLightning, setShowLightning] = useState(true)
  const intervalRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    getRadarFrames()
      .then(data => { setRadarData(data); setCurrentFrame(data.frames.length - 1); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const togglePlay = useCallback(() => setPlaying(prev => !prev), [])

  useEffect(() => {
    if (playing && radarData?.frames?.length) {
      intervalRef.current = setInterval(() => {
        setCurrentFrame(prev => (prev + 1) % radarData.frames.length)
      }, 500)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [playing, radarData])

  const toggleFullscreen = useCallback(() => {
    if (!fullscreen) {
      containerRef.current?.requestFullscreen?.() ||
      containerRef.current?.webkitRequestFullscreen?.()
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.()
    }
  }, [fullscreen])

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    document.addEventListener('webkitfullscreenchange', handler)
    return () => {
      document.removeEventListener('fullscreenchange', handler)
      document.removeEventListener('webkitfullscreenchange', handler)
    }
  }, [])

  const frameTime = radarData?.frames?.[currentFrame]
    ? new Date(radarData.frames[currentFrame].time * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : ''
  const isForecast = radarData?.frames?.[currentFrame]?.forecast

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-text-dim text-xs font-semibold uppercase tracking-wider">Radar</h2>
        <div className="flex items-center gap-2">
          {showLightning && (
            <span className="text-[10px] text-yellow-400 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              Lightning Live
            </span>
          )}
          <button
            onClick={() => setShowLightning(!showLightning)}
            className={`text-xs px-2 py-0.5 rounded ${showLightning ? 'bg-yellow-400/20 text-yellow-400' : 'bg-surface text-text-muted'}`}
          >⚡</button>
        </div>
      </div>
      <div
        ref={containerRef}
        className={`bg-surface/60 rounded-2xl border border-border/40 overflow-hidden ${fullscreen ? 'fixed inset-0 z-[9999] rounded-none border-0' : ''}`}
      >
        <div className={fullscreen ? 'h-[calc(100%-56px)]' : 'h-[350px]'} style={{ position: 'relative' }}>
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <MapContainer
              center={[lat, lon]}
              zoom={8}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
              attributionControl={false}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" subdomains="abcd" />
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png" subdomains="abcd" zIndex={20} />
              {radarData && <RadarOverlay frames={radarData.frames} host={radarData.host} currentFrame={currentFrame} />}
              {showLightning && <LightningLayer />}
              <StormPolygons alerts={alerts} />
              <CircleMarker center={[lat, lon]} radius={6} pathOptions={{ color: '#4fc3f7', fillColor: '#4fc3f7', fillOpacity: 0.9, weight: 2 }} />
              <CircleMarker center={[lat, lon]} radius={14} pathOptions={{ color: '#4fc3f7', fillColor: '#4fc3f7', fillOpacity: 0.15, weight: 1 }} />
            </MapContainer>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-3 flex items-center gap-3 bg-bg/60">
          <button onClick={togglePlay}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors flex-shrink-0"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          {radarData && (
            <input type="range" min={0} max={(radarData.frames.length || 1) - 1} value={currentFrame}
              onChange={e => { setCurrentFrame(parseInt(e.target.value)); setPlaying(false) }}
              className="flex-1 accent-accent h-1"
            />
          )}
          <span className="text-xs text-text-dim min-w-[4rem] text-right">
            {isForecast && <span className="text-accent mr-1">FC</span>}
            {frameTime}
          </span>
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
    </section>
  )
}
