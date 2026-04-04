import { useState, useCallback, useEffect, useRef } from 'react'
import { getSatelliteFrames } from '../api'
import { formatTime } from '../timezone'

const PRODUCTS = [
  { id: 'geocolor', label: 'GeoColor', product: 'GEOCOLOR' },
  { id: 'infrared', label: 'Infrared', product: '13' },
  { id: 'watervapor', label: 'Water Vapor', product: '09' },
  { id: 'airmass', label: 'Air Mass', product: 'AirMass' },
  { id: 'visible', label: 'Visible', product: '02' },
  { id: 'sandwich', label: 'Sandwich', product: 'Sandwich' },
  { id: 'dust', label: 'Dust', product: 'Dust' },
  { id: 'fire', label: 'Fire', product: 'FireTemperature' },
]

const REGIONS = [
  { id: 'umv', label: 'Midwest', sector: 'UMV' },
  { id: 'cgl', label: 'Great Lakes', sector: 'CGL' },
  { id: 'sp', label: 'S. Plains', sector: 'SP' },
  { id: 'smv', label: 'Gulf Coast', sector: 'SMV' },
  { id: 'ne', label: 'Northeast', sector: 'NE' },
  { id: 'se', label: 'Southeast', sector: 'SE' },
  { id: 'pnw', label: 'Pacific NW', sector: 'PNW' },
  { id: 'psw', label: 'Pacific SW', sector: 'PSW' },
  { id: 'nr', label: 'N. Rockies', sector: 'NR' },
  { id: 'sr', label: 'S. Rockies', sector: 'SR' },
  { id: 'conus', label: 'Full US', sector: 'CONUS' },
]

function relativeLabel(unixSec) {
  const diffMin = Math.round((unixSec - Date.now() / 1000) / 60)
  if (Math.abs(diffMin) <= 1) return 'Now'
  if (diffMin < 0) return `${Math.abs(diffMin)}m ago`
  return `+${diffMin}m`
}

export default function SatelliteMap({ lat, lon }) {
  const [region, setRegion] = useState('umv')
  const [product, setProduct] = useState('geocolor')
  const [frames, setFrames] = useState([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [error, setError] = useState(null)
  const [retryKey, setRetryKey] = useState(0)

  const intervalRef = useRef(null)
  const dwellRef = useRef(0)
  const containerRef = useRef(null)
  const genRef = useRef(0)

  // Fetch and preload frames when region/product changes
  useEffect(() => {
    let cancelled = false
    const gen = ++genRef.current

    async function fetchFrames(showLoading) {
      if (showLoading) {
        setLoading(true)
        setProgress(0)
        setPlaying(false)
        setError(null)
      }

      const r = REGIONS.find(x => x.id === region)
      const p = PRODUCTS.find(x => x.id === product)

      try {
        const newFrames = await getSatelliteFrames(r.sector, p.product, 30)
        if (cancelled || gen !== genRef.current) return
        if (!newFrames.length) {
          if (showLoading) { setError('No imagery available for this combination'); setLoading(false) }
          return
        }

        // Preload all images
        let loaded = 0
        await Promise.all(newFrames.map(f =>
          new Promise(resolve => {
            const img = new Image()
            img.onload = () => {
              loaded++
              if (!cancelled && gen === genRef.current && showLoading)
                setProgress(Math.round(loaded / newFrames.length * 100))
              resolve()
            }
            img.onerror = () => { loaded++; resolve() }
            img.src = f.url
          })
        ))

        if (cancelled || gen !== genRef.current) return
        setFrames(newFrames)
        if (showLoading) {
          setFrameIdx(newFrames.length - 1)
          setLoading(false)
          setPlaying(true)
        }
      } catch {
        if (!cancelled && gen === genRef.current && showLoading) {
          setError('Failed to load satellite imagery')
          setLoading(false)
        }
      }
    }

    fetchFrames(true)
    const timer = setInterval(() => fetchFrames(false), 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [region, product, retryKey])

  // Animation loop with dwell on latest frame
  useEffect(() => {
    if (!playing || !frames.length) { clearInterval(intervalRef.current); return }

    const total = frames.length
    const DWELL_TICKS = 8
    dwellRef.current = 0

    intervalRef.current = setInterval(() => {
      setFrameIdx(prev => {
        if (prev === total - 1 && dwellRef.current < DWELL_TICKS) {
          dwellRef.current++
          return prev
        }
        dwellRef.current = 0
        return (prev + 1) % total
      })
    }, 120)

    return () => clearInterval(intervalRef.current)
  }, [playing, frames])

  // Fullscreen
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

  const currentFrame = frames[frameIdx]
  const frameTime = currentFrame ? formatTime(new Date(currentFrame.time * 1000)) : ''
  const relTime = currentFrame ? relativeLabel(currentFrame.time) : ''

  return (
    <section className="mb-6">
      <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3 px-1">Satellite Imagery</h2>
      <div
        ref={containerRef}
        className={`glass-card overflow-hidden ${fullscreen ? 'fixed inset-0 z-[9999] rounded-none border-0' : ''}`}
      >
        {/* Region selector */}
        <div className="scroll-x flex gap-1.5 px-3 py-2">
          {REGIONS.map(r => (
            <button key={r.id}
              onClick={() => setRegion(r.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                region === r.id ? 'bg-accent/20 text-accent' : 'text-text-muted hover:bg-surface'
              }`}
            >{r.label}</button>
          ))}
        </div>

        {/* Image viewer */}
        <div className={`relative bg-black ${fullscreen ? 'h-[calc(100%-148px)]' : 'h-[400px]'}`}>
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <div className="w-48 h-1.5 bg-surface rounded-full overflow-hidden">
                <div className="h-full bg-accent/60 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-text-dim text-xs">Loading satellite imagery...</span>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <span className="text-text-muted text-sm">{error}</span>
              <button onClick={() => setRetryKey(k => k + 1)} className="text-accent text-xs hover:underline">Retry</button>
            </div>
          ) : currentFrame ? (
            <img
              src={currentFrame.url}
              alt={`${REGIONS.find(r => r.id === region)?.label} ${PRODUCTS.find(p => p.id === product)?.label}`}
              className="w-full h-full object-contain select-none"
              draggable={false}
            />
          ) : null}
        </div>

        {/* Product selector */}
        <div className="scroll-x flex gap-1.5 px-3 py-2 border-t border-white/[0.04]">
          {PRODUCTS.map(p => (
            <button key={p.id}
              onClick={() => setProduct(p.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                product === p.id ? 'bg-accent/20 text-accent' : 'text-text-muted hover:bg-surface'
              }`}
            >{p.label}</button>
          ))}
        </div>

        {/* Animation controls */}
        <div className="px-4 py-3 bg-bg/60">
          <div className="flex items-center gap-3">
            <button onClick={() => setPlaying(p => !p)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors flex-shrink-0"
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>

            {frames.length > 0 && (
              <div className="flex-1 relative">
                <input type="range" min={0} max={frames.length - 1} value={frameIdx}
                  onChange={e => { setFrameIdx(parseInt(e.target.value)); setPlaying(false); dwellRef.current = 0 }}
                  className="w-full accent-accent h-1 relative z-10"
                />
                <div className="flex items-center mt-1 px-0.5 h-2">
                  {frames.map((_, i) => (
                    <div key={i} className="flex-1 flex justify-center">
                      <div className={`rounded-full transition-all duration-150 ${
                        i === frameIdx ? 'w-2 h-2 bg-accent' :
                        i === frames.length - 1 ? 'w-1.5 h-1.5 bg-text' :
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
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
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
