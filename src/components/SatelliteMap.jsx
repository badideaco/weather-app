import { useState, useCallback, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// NASA GIBS satellite layers — reliable WMTS with CORS
const GIBS_LAYERS = [
  { id: 'geocolor', label: 'GeoColor', layer: 'GOES-East_ABI_GeoColor', ext: 'jpg' },
  { id: 'infrared', label: 'Infrared', layer: 'GOES-East_ABI_Band13_Clean_Infrared', ext: 'png' },
  { id: 'water', label: 'Water Vapor', layer: 'GOES-East_ABI_Band08_Upper_Level_Water_Vapor', ext: 'png' },
]

function GIBSOverlay({ layerId, ext }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (!map || !layerId) return
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }

    // Omit date to get GIBS "latest available" GOES imagery
    // Cache-bust every 10 min so browser fetches fresh tiles
    const cacheBust = Math.floor(Date.now() / 600000)
    const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerId}/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.${ext}?_=${cacheBust}`
    layerRef.current = L.tileLayer(url, { opacity: 0.7, zIndex: 10, maxZoom: 6 })
    layerRef.current.addTo(map)

    return () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null } }
  }, [map, layerId, ext])

  return null
}

export default function SatelliteMap({ lat, lon }) {
  const [activeLayer, setActiveLayer] = useState('infrared')
  const [fullscreen, setFullscreen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const containerRef = useRef(null)

  // Auto-refresh tiles every 10 minutes
  useEffect(() => {
    const timer = setInterval(() => setRefreshKey(k => k + 1), 10 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const currentLayer = GIBS_LAYERS.find(l => l.id === activeLayer)

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
          <MapContainer
            center={[lat, lon]}
            zoom={5}
            maxZoom={6}
            bounceAtZoomLimits={false}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            <GIBSOverlay key={refreshKey} layerId={currentLayer.layer} ext={currentLayer.ext} />
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png" subdomains="abcd" zIndex={20} />
            <CircleMarker center={[lat, lon]} radius={5} pathOptions={{ color: '#4fc3f7', fillColor: '#4fc3f7', fillOpacity: 0.9, weight: 2 }} />
          </MapContainer>
        </div>

        {/* Controls */}
        <div className="px-4 py-2.5 flex items-center justify-between bg-bg/60">
          <div className="flex gap-1">
            {GIBS_LAYERS.map(l => (
              <button key={l.id}
                onClick={() => setActiveLayer(l.id)}
                className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                  activeLayer === l.id ? 'bg-accent/20 text-accent' : 'text-text-muted hover:bg-surface'
                }`}
              >{l.label}</button>
            ))}
          </div>
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
