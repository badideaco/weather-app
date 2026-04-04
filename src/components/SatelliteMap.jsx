import { useState, useCallback, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// RainViewer provides satellite infrared tiles with proper CORS
function SatelliteOverlay({ host, path }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (!host || !path || !map) return
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    const url = `${host}${path}/512/{z}/{x}/{y}/0/0_0.png`
    layerRef.current = L.tileLayer(url, { opacity: 0.7, zIndex: 10, tileSize: 512, zoomOffset: -1 })
    layerRef.current.addTo(map)
    return () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null } }
  }, [map, host, path])

  return null
}

export default function SatelliteMap({ lat, lon }) {
  const [satData, setSatData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(r => r.json())
      .then(data => {
        const frames = data.satellite?.infrared || []
        if (frames.length) {
          setSatData({ host: data.host || 'https://tilecache.rainviewer.com', path: frames[frames.length - 1].path })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!fullscreen) {
      containerRef.current?.requestFullscreen?.() || containerRef.current?.webkitRequestFullscreen?.()
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

  return (
    <section className="mb-6">
      <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3 px-1">Satellite Imagery</h2>
      <div
        ref={containerRef}
        className={`glass-card overflow-hidden ${fullscreen ? 'fixed inset-0 z-[9999] rounded-none' : ''}`}
      >
        <div className={fullscreen ? 'h-[calc(100%-48px)]' : 'h-[300px]'}>
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <MapContainer
              center={[lat, lon]}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
              attributionControl={false}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" subdomains="abcd" />
              {satData && <SatelliteOverlay host={satData.host} path={satData.path} />}
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png" subdomains="abcd" zIndex={20} />
              <CircleMarker center={[lat, lon]} radius={5} pathOptions={{ color: '#4fc3f7', fillColor: '#4fc3f7', fillOpacity: 0.9, weight: 2 }} />
            </MapContainer>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-2.5 flex items-center justify-between bg-bg/60">
          <span className="text-text-muted text-xs">Infrared</span>
          <button
            onClick={toggleFullscreen}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface text-text-muted hover:text-text transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              {fullscreen ? <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}
