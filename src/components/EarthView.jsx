import { useState, useCallback, useEffect, useRef } from 'react'
import { getSatelliteFrames, getEPICImages } from '../api'
import { formatTime, formatDate } from '../timezone'

const VIEWS = [
  { id: 'goes-east', label: 'GOES East', type: 'goes', sector: 'FD', desc: 'Americas + Atlantic' },
  { id: 'goes-west', label: 'GOES West', type: 'goes', sector: 'FD-WEST', desc: 'Pacific + W. Americas' },
  { id: 'epic', label: 'EPIC', type: 'epic', desc: 'Whole sunlit Earth from 1M miles (DSCOVR L1)' },
  { id: 'europe', label: 'Meteosat EU', type: 'static', url: 'https://eumetview.eumetsat.int/static-images/latestImages/EUMETSAT_MSG_RGBNatColourEnhncd_FullResolution.jpg', desc: 'Europe + Africa' },
  { id: 'indian', label: 'Meteosat IO', type: 'static', url: 'https://eumetview.eumetsat.int/static-images/latestImages/EUMETSAT_MSGIODC_RGBNatColourEnhncd_FullResolution.jpg', desc: 'Indian Ocean' },
]

function relativeLabel(unixSec) {
  const diffMin = Math.round((unixSec - Date.now() / 1000) / 60)
  if (Math.abs(diffMin) <= 1) return 'Now'
  if (diffMin < 0) {
    const hrs = Math.abs(diffMin) >= 60 ? `${Math.floor(Math.abs(diffMin) / 60)}h ${Math.abs(diffMin) % 60}m` : `${Math.abs(diffMin)}m`
    return `${hrs} ago`
  }
  return `+${diffMin}m`
}

export default function EarthView() {
  const [view, setView] = useState('goes-east')
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

  const currentView = VIEWS.find(v => v.id === view)

  // Fetch and preload frames based on view type
  useEffect(() => {
    let cancelled = false
    const gen = ++genRef.current
    setLoading(true)
    setProgress(0)
    setPlaying(false)
    setError(null)

    async function load() {
      try {
        let newFrames = []

        if (currentView.type === 'goes') {
          newFrames = await getSatelliteFrames(currentView.sector, 'GEOCOLOR', 20)
        } else if (currentView.type === 'epic') {
          newFrames = await getEPICImages('enhanced')
        } else if (currentView.type === 'static') {
          const cb = Math.floor(Date.now() / 900000)
          newFrames = [{ url: `${currentView.url}?_=${cb}`, time: Math.floor(Date.now() / 1000) }]
        }

        if (cancelled || gen !== genRef.current) return
        if (!newFrames.length) { setError('No imagery available'); setLoading(false); return }

        let loaded = 0
        await Promise.all(newFrames.map(f =>
          new Promise(resolve => {
            const img = new Image()
            img.onload = () => {
              loaded++
              if (!cancelled && gen === genRef.current) setProgress(Math.round(loaded / newFrames.length * 100))
              resolve()
            }
            img.onerror = () => { loaded++; resolve() }
            img.src = f.url
          })
        ))

        if (cancelled || gen !== genRef.current) return
        setFrames(newFrames)
        setFrameIdx(newFrames.length - 1)
        setLoading(false)
        if (newFrames.length > 1) setPlaying(true)
      } catch {
        if (!cancelled && gen === genRef.current) { setError('Failed to load imagery'); setLoading(false) }
      }
    }

    load()
    const refreshMs = currentView.type === 'goes' ? 10 * 60 * 1000 : 30 * 60 * 1000
    const timer = setInterval(() => {
      load() // silent refresh reuses same gen check
    }, refreshMs)
    return () => { cancelled = true; clearInterval(timer) }
  }, [view, retryKey])

  // Animation loop
  useEffect(() => {
    if (!playing || frames.length <= 1) { clearInterval(intervalRef.current); return }

    const total = frames.length
    const isEpic = currentView?.type === 'epic'
    const DWELL = isEpic ? 4 : 8
    const SPEED = isEpic ? 1500 : 120
    dwellRef.current = 0

    intervalRef.current = setInterval(() => {
      setFrameIdx(prev => {
        if (prev === total - 1 && dwellRef.current < DWELL) { dwellRef.current++; return prev }
        dwellRef.current = 0
        return (prev + 1) % total
      })
    }, SPEED)

    return () => clearInterval(intervalRef.current)
  }, [playing, frames, currentView])

  // Fullscreen — CSS-based (iOS Safari doesn't support requestFullscreen on divs)
  const toggleFullscreen = useCallback(() => {
    setFullscreen(f => !f)
  }, [])

  const frame = frames[frameIdx]
  const frameTime = frame ? formatTime(new Date(frame.time * 1000)) : ''
  const relTime = frame ? relativeLabel(frame.time) : ''
  const epicInfo = currentView?.type === 'epic' && frame
    ? `${formatDate(new Date(frame.time * 1000), { month: 'short', day: 'numeric' })} · ${frame.lat != null ? `${Math.abs(frame.lat).toFixed(0)}°${frame.lat >= 0 ? 'N' : 'S'}, ${Math.abs(frame.lon).toFixed(0)}°${frame.lon >= 0 ? 'E' : 'W'}` : ''}`
    : null

  return (
    <section className="mb-6">
      <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3 px-1">Live Earth</h2>
      <div ref={containerRef} className={`glass-card overflow-hidden ${fullscreen ? 'fixed inset-0 z-[9999] rounded-none border-0' : ''}`}>
        {/* View selector */}
        <div className="scroll-x flex gap-1.5 px-3 py-2">
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                view === v.id ? 'bg-accent/20 text-accent' : 'text-text-muted hover:bg-surface'
              }`}
            >{v.label}</button>
          ))}
        </div>

        {/* Image viewer */}
        <div className={`relative bg-black ${fullscreen ? 'h-[calc(100%-108px)]' : 'h-[400px]'}`}>
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <div className="w-48 h-1.5 bg-surface rounded-full overflow-hidden">
                <div className="h-full bg-accent/60 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-text-dim text-xs">
                {currentView?.type === 'epic' ? 'Loading EPIC images from DSCOVR...' : 'Loading satellite imagery...'}
              </span>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <span className="text-text-muted text-sm">{error}</span>
              <button onClick={() => setRetryKey(k => k + 1)} className="text-accent text-xs hover:underline">Retry</button>
            </div>
          ) : frame ? (
            <img src={frame.url} alt={currentView?.desc} className="w-full h-full object-contain select-none" draggable={false} />
          ) : null}
        </div>

        {/* Controls */}
        <div className="px-4 py-3 bg-bg/60">
          {frames.length > 1 ? (
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

              <div className="flex-1 relative">
                <input type="range" min={0} max={frames.length - 1} value={frameIdx}
                  onChange={e => { setFrameIdx(parseInt(e.target.value)); setPlaying(false); dwellRef.current = 0 }}
                  className="w-full accent-accent h-1 relative z-10"
                />
                {frames.length <= 30 && (
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
                )}
              </div>

              <div className="flex flex-col items-end flex-shrink-0 min-w-[5.5rem]">
                {epicInfo ? (
                  <>
                    <span className="text-xs text-text-dim leading-tight">{epicInfo}</span>
                    <span className="text-[10px] text-text-muted leading-tight">{frameTime}</span>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-text-dim leading-tight">{frameTime}</span>
                    <span className="text-[10px] text-text-muted leading-tight">{relTime}</span>
                  </>
                )}
              </div>

              <button onClick={toggleFullscreen}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface text-text-muted hover:text-text transition-colors flex-shrink-0"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  {fullscreen ? <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-text-dim text-xs">{currentView?.desc} · Updated every 15 min</span>
              <button onClick={toggleFullscreen}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface text-text-muted hover:text-text transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  {fullscreen ? <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
