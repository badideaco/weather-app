import { useState, useCallback, useEffect, useRef, memo } from 'react'
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

const FRAME_MS = 120
const DWELL_TICKS = 8

function relativeLabel(unixSec) {
  const diffMin = Math.round((unixSec - Date.now() / 1000) / 60)
  if (Math.abs(diffMin) <= 1) return 'Now'
  if (diffMin < 0) return `${Math.abs(diffMin)}m ago`
  return `+${diffMin}m`
}

// Memoized so the 30-dot row doesn't re-diff every animation tick
const FrameDots = memo(function FrameDots({ count, current }) {
  return (
    <div className="flex items-center mt-1 px-0.5 h-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex-1 flex justify-center">
          <div className={`rounded-full transition-all duration-150 ${
            i === current ? 'w-2 h-2 bg-accent' :
            i === count - 1 ? 'w-1.5 h-1.5 bg-text' :
            'w-1 h-1 bg-text-muted/30'
          }`} />
        </div>
      ))}
    </div>
  )
})

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

  const containerRef = useRef(null)
  const genRef = useRef(0)
  // Retains HTMLImageElement refs so decoded pixel data + HTTP cache entries survive
  // across animation loops. Without this, detached Image objects were GC'd after preload
  // and each frame step triggered a fresh network/decode round-trip.
  const imagesRef = useRef(new Map())
  const rafRef = useRef(null)

  // Fetch frame URLs + preload each with img.decode() so frames are guaranteed
  // paint-ready before playback starts (no main-thread decode jank mid-loop).
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

        // Preload & decode, reusing images already in the ref map
        const nextImages = new Map()
        let loaded = 0
        await Promise.all(newFrames.map(async f => {
          const existing = imagesRef.current.get(f.url)
          if (existing) {
            nextImages.set(f.url, existing)
          } else {
            const img = new Image()
            img.decoding = 'async'
            img.src = f.url
            try {
              await img.decode()
            } catch {
              // Corrupt or unreachable frame — keep going; the DOM <img> will still try.
            }
            nextImages.set(f.url, img)
          }
          loaded++
          if (!cancelled && gen === genRef.current && showLoading) {
            setProgress(Math.round(loaded / newFrames.length * 100))
          }
        }))

        if (cancelled || gen !== genRef.current) return
        // Swap in the new map — old refs (for frames that rolled off) become GC-eligible
        imagesRef.current = nextImages
        setFrames(newFrames)
        if (showLoading) {
          setFrameIdx(newFrames.length - 1)
          setLoading(false)
          setPlaying(true)
        } else {
          // Background refresh — clamp index in case list shrank
          setFrameIdx(idx => Math.min(idx, newFrames.length - 1))
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

  // Animation loop — requestAnimationFrame with time accumulator. Drops frames
  // gracefully if the main thread stalls, instead of queueing stale setInterval work.
  useEffect(() => {
    if (!playing || !frames.length) return

    let lastTick = performance.now()
    let dwellTicks = 0

    const step = (now) => {
      if (now - lastTick >= FRAME_MS) {
        lastTick = now
        setFrameIdx(prev => {
          const total = frames.length
          if (prev === total - 1 && dwellTicks < DWELL_TICKS) {
            dwellTicks++
            return prev
          }
          dwellTicks = 0
          return (prev + 1) % total
        })
      }
      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
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
  const regionLabel = REGIONS.find(r => r.id === region)?.label
  const productLabel = PRODUCTS.find(p => p.id === product)?.label

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

        {/* Image viewer — all frames rendered as stacked layers, current shown via opacity.
            Once mounted & decoded, stepping frames is a pure compositor op (no re-decode). */}
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
          ) : frames.length > 0 ? (
            frames.map((f, i) => (
              <img
                key={f.url}
                src={f.url}
                alt={i === frameIdx ? `${regionLabel} ${productLabel}` : ''}
                aria-hidden={i !== frameIdx}
                className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
                style={{ opacity: i === frameIdx ? 1 : 0 }}
                decoding="async"
                draggable={false}
              />
            ))
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
                  onChange={e => { setFrameIdx(parseInt(e.target.value)); setPlaying(false) }}
                  className="w-full accent-accent h-1 relative z-10"
                />
                <FrameDots count={frames.length} current={frameIdx} />
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
