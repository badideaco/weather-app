import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getNearbyFlights } from '../api'
import 'leaflet/dist/leaflet.css'

function createPlaneIcon(heading, onGround) {
  const rotation = heading ?? 0
  const color = onGround ? '#555570' : '#4fc3f7'
  return L.divIcon({
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `<svg viewBox="0 0 24 24" width="20" height="20" style="transform:rotate(${rotation}deg)">
      <path d="M12 2L4 14h3l1 8h8l1-8h3L12 2z" fill="${color}" stroke="#0a0a1a" stroke-width="1"/>
    </svg>`,
  })
}

function FlightMarkers({ flights }) {
  if (!flights?.length) return null
  return flights.map(f => (
    <Marker
      key={f.icao24}
      position={[f.lat, f.lon]}
      icon={createPlaneIcon(f.heading, f.onGround)}
    >
      <Popup className="dark-popup">
        <div style={{ color: '#e8e8ec', fontSize: '12px', lineHeight: 1.5 }}>
          <strong style={{ fontSize: '14px' }}>{f.callsign || f.icao24}</strong>
          {f.type && <span style={{ color: '#8888a8', marginLeft: 6 }}>{f.type}</span>}
          <br />
          {f.altitude != null && <>Alt: {f.altitude.toLocaleString()} ft<br /></>}
          {f.velocity != null && <>Speed: {f.velocity} mph<br /></>}
          {f.verticalRate != null && f.verticalRate !== 0 && (
            <>{f.verticalRate > 0 ? '↗️' : '↘️'} {Math.abs(f.verticalRate)} ft/min<br /></>
          )}
          {f.registration && <span style={{ color: '#8888a8' }}>{f.registration}</span>}
        </div>
      </Popup>
    </Marker>
  ))
}

function MapCenter({ lat, lon }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lon], map.getZoom())
  }, [lat, lon, map])
  return null
}

export default function FlightTracker({ lat, lon }) {
  const [flights, setFlights] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [visible, setVisible] = useState(false)
  const sectionRef = useRef(null)
  const fetchedRef = useRef(false)

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
      .then(setFlights)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [lat, lon])

  useEffect(() => {
    if (visible) fetchFlights()
  }, [visible, fetchFlights])

  // Auto-refresh every 15 seconds when visible
  useEffect(() => {
    if (!visible) return
    const interval = setInterval(fetchFlights, 15000)
    return () => clearInterval(interval)
  }, [visible, fetchFlights])

  const airborne = flights?.filter(f => !f.onGround) || []

  return (
    <section className="mb-6" ref={sectionRef}>
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em]">Nearby Flights</h2>
        {flights && (
          <span className="text-text-muted text-xs">{airborne.length} airborne</span>
        )}
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
          {/* Overlay status indicators */}
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

        {/* Flight list */}
        {airborne.length > 0 && (
          <div className="max-h-40 overflow-y-auto border-t border-border/30">
            {airborne.slice(0, 15).map(f => (
              <div key={f.icao24} className="flex items-center gap-3 px-4 py-2 border-b border-border/20 last:border-0">
                <span className="text-accent text-xs font-mono w-16 flex-shrink-0">
                  {f.callsign || f.icao24}
                </span>
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
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
