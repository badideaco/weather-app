import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getRadarFrames } from '../api'
import 'leaflet/dist/leaflet.css'

function RadarOverlay({ frames, host, currentFrame }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (!frames?.length || !map) return

    if (layerRef.current) {
      map.removeLayer(layerRef.current)
      layerRef.current = null
    }

    const frame = frames[currentFrame]
    if (!frame) return

    const tileUrl = `${host}${frame.path}/256/{z}/{x}/{y}/6/1_1.png`
    layerRef.current = L.tileLayer(tileUrl, { opacity: 0.65, zIndex: 10 })
    layerRef.current.addTo(map)

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map, frames, host, currentFrame])

  return null
}

export default function RadarMap({ lat, lon }) {
  const [radarData, setRadarData] = useState(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef(null)

  useEffect(() => {
    getRadarFrames()
      .then(data => {
        setRadarData(data)
        setCurrentFrame(data.frames.length - 1)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const togglePlay = useCallback(() => {
    setPlaying(prev => !prev)
  }, [])

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

  const frameTime = radarData?.frames?.[currentFrame]
    ? new Date(radarData.frames[currentFrame].time * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : ''

  const isForecast = radarData?.frames?.[currentFrame]?.forecast

  return (
    <section className="mb-6">
      <h2 className="text-text-dim text-xs font-semibold uppercase tracking-wider mb-3 px-1">Radar</h2>
      <div className="bg-surface/60 rounded-2xl border border-border/40 overflow-hidden">
        <div className="h-[300px] relative">
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
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
              />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
                zIndex={20}
              />
              {radarData && (
                <RadarOverlay
                  frames={radarData.frames}
                  host={radarData.host}
                  currentFrame={currentFrame}
                />
              )}
            </MapContainer>
          )}
        </div>

        {/* Radar controls */}
        {radarData && (
          <div className="px-4 py-3 flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors flex-shrink-0"
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={(radarData.frames.length || 1) - 1}
              value={currentFrame}
              onChange={e => { setCurrentFrame(parseInt(e.target.value)); setPlaying(false) }}
              className="flex-1 accent-accent h-1"
            />
            <span className="text-xs text-text-dim min-w-[4rem] text-right">
              {isForecast && <span className="text-accent mr-1">FC</span>}
              {frameTime}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
