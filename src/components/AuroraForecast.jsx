import { useState, useCallback, useEffect, useRef } from 'react'
import { getAuroraFrames } from '../api'
import { formatTime } from '../timezone'

function relativeLabel(unixSec) {
  const diffMin = Math.round((unixSec - Date.now() / 1000) / 60)
  if (Math.abs(diffMin) <= 1) return 'Now'
  if (diffMin < 0) return `${Math.abs(diffMin)}m ago`
  return `+${diffMin}m`
}

export default function AuroraForecast() {
  const [hemisphere, setHemisphere] = useState('north')
  const [frames, setFrames] = useState([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [error, setError] = useState(null)

  const intervalRef = useRef(null)
  const dwellRef = useRef(0)
  const containerRef = useRef(null)
  const genRef = useRef(0)

  // Fetch and preload aurora frames
  useEffect(() => {
    let cancelled = false
    const gen = ++genRef.current
    setLoading(true)
    setProgress(0)
    setPlaying(false)
    setError(null)

    async function load() {
      try {
        const allFrames = await getAuroraFrames(hemisphere)
        if (cancelled || gen !== genRef.current) return
        if (!allFrames.length) { setError('No aurora data available'); setLoading(false); return }

        // Take every 4th frame to keep it manageable (~72 frames from 288)
        const sampled = allFrames.filter((_, i) => i % 4 === 0 || i === allFrames.length - 1)

        let loaded = 0
        await Promise.all(sampled.map(f =>
          new Promise(resolve => {
            const img = new Image()
            img.onload = () => {
              loaded++
              if (!cancelled && gen === genRef.current) setProgress(Math.round(loaded / sampled.length * 100))
              resolve()
            }
            img.onerror = () => { loaded++; resolve() }
            img.src = f.url
          })
        ))

        if (cancelled || gen !== genRef.current) return
        setFrames(sampled)
        setFrameIdx(sampled.length - 1)
        setLoading(false)
        setPlaying(true)
      } catch {
        if (!cancelled && gen === genRef.current) { setError('Failed to load aurora forecast'); setLoading(false) }
      }
    }

    load()
    return () => { cancelled = true }
  }, [hemisphere])

  // Animation loop
  useEffect(() => {
    if (!playing || frames.length <= 1) { clearInterval(intervalRef.current); return }
    const total = frames.length
    dwellRef.current = 0

    intervalRef.current = setInterval(() => {
      setFrameIdx(prev => {
        if (prev === total - 1 && dwellRef.current < 6) { dwellRef.current++; return prev }
        dwellRef.current = 0
        return (prev + 1) % total
      })
    }, 150)

    return () => clearInterval(intervalRef.current)
  }, [playing, frames])

  // Fullscreen — CSS-based (iOS Safari doesn't support requestFullscreen on divs)
  const toggleFullscreen = useCallback(() => {
    setFullscreen(f => !f)
  }, [])

  const frame = frames[frameIdx]
  const frameTime = frame ? formatTime(new Date(frame.time * 1000)) : ''
  const relTime = frame ? relativeLabel(frame.time) : ''

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em]">Aurora Forecast</h2>
        <div className="flex gap-1">
          {['north', 'south'].map(h => (
            <button key={h} onClick={() => setHemisphere(h)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                hemisphere === h ? 'bg-accent/20 text-accent' : 'text-text-muted hover:bg-surface'
              }`}
            >{h === 'north' ? 'North' : 'South'}</button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className={`glass-card overflow-hidden ${fullscreen ? 'fixed inset-0 z-[9999] rounded-none border-0' : ''}`}>
        {/* Image viewer */}
        <div className={`relative bg-[#0a0a12] ${fullscreen ? 'h-[calc(100%-64px)]' : 'h-[350px]'}`}>
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <div className="w-48 h-1.5 bg-surface rounded-full overflow-hidden">
                <div className="h-full bg-accent/60 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-text-dim text-xs">Loading aurora forecast...</span>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <span className="text-text-muted text-sm">{error}</span>
            </div>
          ) : frame ? (
            <img src={frame.url} alt={`Aurora forecast ${hemisphere}`} className="w-full h-full object-contain select-none" draggable={false} />
          ) : null}
        </div>

        {/* Animation controls */}
        {frames.length > 1 && (
          <div className="px-4 py-2.5 bg-bg/60">
            <div className="flex items-center gap-3">
              <button onClick={() => setPlaying(p => !p)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors flex-shrink-0"
              >
                {playing ? (
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>

              <input type="range" min={0} max={frames.length - 1} value={frameIdx}
                onChange={e => { setFrameIdx(parseInt(e.target.value)); setPlaying(false); dwellRef.current = 0 }}
                className="flex-1 accent-accent h-1"
              />

              <div className="flex flex-col items-end flex-shrink-0 min-w-[5rem]">
                <span className="text-xs text-text-dim leading-tight">{frameTime}</span>
                <span className="text-[10px] text-text-muted leading-tight">{relTime}</span>
              </div>

              <button onClick={toggleFullscreen}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface text-text-muted hover:text-text transition-colors flex-shrink-0"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  {fullscreen ? <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
