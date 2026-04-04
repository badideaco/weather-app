import { useState, useCallback } from 'react'
import { MapContainer, TileLayer, WMSTileLayer, CircleMarker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const SATELLITE_LAYERS = [
  { id: 'visible', label: 'Visible', layer: 'goes_east' },
  { id: 'infrared', label: 'Infrared', layer: 'goes_east_ir' },
  { id: 'water', label: 'Water Vapor', layer: 'goes_east_wv' },
]

export default function SatelliteMap({ lat, lon }) {
  const [activeLayer, setActiveLayer] = useState('visible')
  const [fullscreen, setFullscreen] = useState(false)

  const toggleFullscreen = useCallback((el) => {
    if (!fullscreen && el) {
      el.requestFullscreen?.() || el.webkitRequestFullscreen?.()
      setFullscreen(true)
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.()
      setFullscreen(false)
    }
  }, [fullscreen])

  const containerRef = useCallback(node => {
    if (!node) return
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const currentLayer = SATELLITE_LAYERS.find(l => l.id === activeLayer)

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
            zoom={6}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            <WMSTileLayer
              url="https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi"
              layers={currentLayer.layer}
              transparent={true}
              format="image/png"
              opacity={0.7}
              zIndex={10}
            />
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png" subdomains="abcd" zIndex={20} />
            <CircleMarker center={[lat, lon]} radius={5} pathOptions={{ color: '#4fc3f7', fillColor: '#4fc3f7', fillOpacity: 0.9, weight: 2 }} />
          </MapContainer>
        </div>

        {/* Controls */}
        <div className="px-4 py-2.5 flex items-center justify-between bg-bg/60">
          <div className="flex gap-1">
            {SATELLITE_LAYERS.map(l => (
              <button key={l.id}
                onClick={() => setActiveLayer(l.id)}
                className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                  activeLayer === l.id ? 'bg-accent/20 text-accent' : 'text-text-muted hover:bg-surface'
                }`}
              >{l.label}</button>
            ))}
          </div>
          <button
            onClick={(e) => toggleFullscreen(e.currentTarget.closest('[class*="rounded-2xl"], [class*="fixed"]'))}
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
