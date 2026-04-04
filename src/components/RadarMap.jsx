import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polygon, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getRadarFrames } from '../api'
import { formatTime, TZ } from '../timezone'
import 'leaflet/dist/leaflet.css'

// ── Radar tile overlay (pre-loads ALL frames, toggles opacity) ──
function RadarOverlay({ frames, host, currentFrame }) {
  const map = useMap()
  const layersRef = useRef([])
  const prevFrameRef = useRef(-1)

  // Create all tile layers once when frame data changes
  useEffect(() => {
    if (!frames?.length || !map) return

    // Remove old layers
    layersRef.current.forEach(l => {
      if (l && map.hasLayer(l)) map.removeLayer(l)
    })

    // Pre-create every frame layer with opacity 0
    const layers = frames.map((frame, i) => {
      const url = `${host}${frame.path}/512/{z}/{x}/{y}/6/1_1.png`
      const layer = L.tileLayer(url, {
        opacity: i === currentFrame ? 0.65 : 0,
        zIndex: 10,
        tileSize: 512,
        zoomOffset: -1,
      })
      layer.addTo(map)
      return layer
    })

    layersRef.current = layers
    prevFrameRef.current = currentFrame

    return () => {
      layers.forEach(l => {
        if (l && map.hasLayer(l)) map.removeLayer(l)
      })
      layersRef.current = []
    }
  }, [map, frames, host]) // eslint-disable-line

  // Toggle frame visibility (instant swap — no tile reload)
  useEffect(() => {
    const layers = layersRef.current
    if (!layers.length) return

    const prev = prevFrameRef.current
    if (prev >= 0 && prev < layers.length && layers[prev]) {
      layers[prev].setOpacity(0)
    }
    if (currentFrame >= 0 && currentFrame < layers.length && layers[currentFrame]) {
      layers[currentFrame].setOpacity(0.65)
    }
    prevFrameRef.current = currentFrame
  }, [currentFrame])

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
          ws.send(JSON.stringify({ a: 418 }))
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.lat != null && data.lon != null) {
              const strike = { lat: data.lat, lon: data.lon, time: Date.now() }
              strikesRef.current.push(strike)

              const circle = L.circleMarker([data.lat, data.lon], {
                radius: 4,
                color: '#fff',
                fillColor: '#ffeb3b',
                fillOpacity: 0.9,
                weight: 1,
              }).addTo(map)

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
          reconnectTimer = setTimeout(connect, 5000)
        }
      } catch {}
    }

    connect()

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

// ── Relative time label ──
function relativeLabel(unixSec) {
  const diffMin = Math.round((unixSec - Date.now() / 1000) / 60)
  if (Math.abs(diffMin) <= 1) return 'Now'
  if (diffMin < 0) return `${Math.abs(diffMin)}m ago`
  return `+${diffMin}m`
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
  const dwellRef = useRef(0)

  useEffect(() => {
    getRadarFrames()
      .then(data => { setRadarData(data); setCurrentFrame(data.frames.length - 1); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const togglePlay = useCallback(() => setPlaying(prev => !prev), [])

  // Animation loop with dwell at "now" (last past frame) and end of forecast
  useEffect(() => {
    if (!playing || !radarData?.frames?.length) {
      clearInterval(intervalRef.current)
      return
    }

    const totalFrames = radarData.frames.length
    // Last past frame = the most recent actual radar image (not a forecast)
    const lastPastIdx = radarData.frames.reduce((acc, f, i) => !f.forecast ? i : acc, 0)
    const dwellFrames = new Set([lastPastIdx, totalFrames - 1])
    const DWELL_TICKS = 3 // Extra ticks to pause (3 × 400ms = 1.2s dwell)

    dwellRef.current = 0

    intervalRef.current = setInterval(() => {
      setCurrentFrame(prev => {
        if (dwellFrames.has(prev) && dwellRef.current < DWELL_TICKS) {
          dwellRef.current++
          return prev // Hold on this frame
        }
        dwellRef.current = 0
        return (prev + 1) % totalFrames
      })
    }, 400)

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

  const currentFrameData = radarData?.frames?.[currentFrame]
  const frameTime = currentFrameData
    ? formatTime(new Date(currentFrameData.time * 1000))
    : ''
  const relTime = currentFrameData ? relativeLabel(currentFrameData.time) : ''
  const isForecast = currentFrameData?.forecast

  // Find boundary between past and forecast for scrubber markers
  const lastPastIdx = radarData?.frames?.reduce((acc, f, i) => !f.forecast ? i : acc, 0) ?? 0

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em]">Radar</h2>
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
        className={`glass-card overflow-hidden ${fullscreen ? 'fixed inset-0 z-[9999] rounded-none border-0' : ''}`}
      >
        <div className={fullscreen ? 'h-[calc(100%-72px)]' : 'h-[350px]'} style={{ position: 'relative' }}>
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <MapContainer
              center={[lat, lon]}
              zoom={8}
              maxZoom={12}
              bounceAtZoomLimits={false}
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

            {/* Custom scrubber with past/forecast visual */}
            {radarData && (
              <div className="flex-1 relative">
                <input type="range" min={0} max={(radarData.frames.length || 1) - 1} value={currentFrame}
                  onChange={e => { setCurrentFrame(parseInt(e.target.value)); setPlaying(false); dwellRef.current = 0 }}
                  className="w-full accent-accent h-1 relative z-10"
                />
                {/* Past/Forecast track markers */}
                <div className="flex items-center mt-1 px-0.5" style={{ gap: 0 }}>
                  {radarData.frames.map((f, i) => {
                    const isNow = i === lastPastIdx
                    const isCurrent = i === currentFrame
                    return (
                      <div
                        key={i}
                        className="flex-1 flex justify-center"
                      >
                        <div
                          className={`rounded-full transition-all duration-150 ${
                            isCurrent
                              ? 'w-2 h-2 bg-accent'
                              : isNow
                                ? 'w-1.5 h-1.5 bg-text'
                                : f.forecast
                                  ? 'w-1 h-1 bg-accent/40'
                                  : 'w-1 h-1 bg-text-muted/30'
                          }`}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col items-end flex-shrink-0 min-w-[5.5rem]">
              <span className="text-xs text-text-dim leading-tight">
                {isForecast && <span className="text-accent mr-1">FC</span>}
                {frameTime}
              </span>
              <span className={`text-[10px] leading-tight ${isForecast ? 'text-accent/70' : 'text-text-muted'}`}>
                {relTime}
              </span>
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
      </div>
    </section>
  )
}
