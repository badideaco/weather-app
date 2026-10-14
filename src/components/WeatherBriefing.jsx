import { useState, useEffect, useRef } from 'react'
import { getCentralHour } from '../timezone'

const BRIEFING_URL = 'https://4pi2u7nqpftngmhbscfu2d3y6m0zugjo.lambda-url.us-east-2.on.aws'
const CACHE_PREFIX = 'stormscope-briefing'
const CACHE_TTL = 30 * 60 * 1000 // 30 min cache
const PERSONALITY_KEY = 'stormscope-personality'

const PERSONALITIES = [
  { key: 'elmer', name: 'Elmer', emoji: '\u{1F474}', label: "Elmer's Weather", loading: 'Grumbling about the weather...' },
  { key: 'wanda', name: 'Wanda', emoji: '\u{1F49C}', label: "Wanda's Weather", loading: 'Wanda is checking the vibes outside...' },
  { key: 'rachel', name: 'Rachel', emoji: '\u{1F484}', label: "Rachel's Forecast", loading: 'Rachel is, like, looking outside...' },
  { key: 'joan', name: 'Joan', emoji: '\u{1F9F6}', label: "Grandma Joan's Weather", loading: 'Grandma Joan is peeking out the window...' },
  { key: 'phil', name: 'Phil', emoji: '\u{1F399}\u{FE0F}', label: "Phil's Weather Desk", loading: 'Phil is preparing your forecast...' },
]

function getSavedPersonality() {
  try { return localStorage.getItem(PERSONALITY_KEY) || 'elmer' } catch { return 'elmer' }
}

function getCacheKey(personality) {
  return `${CACHE_PREFIX}-${personality}`
}

// A cached briefing is only reused for the same set of active alerts: one
// written before a warning was issued must not sit under the warning banner.
// alertSig null = alerts not known yet (skip the check).
function getCachedBriefing(personality, alertSig = null) {
  try {
    const cached = JSON.parse(localStorage.getItem(getCacheKey(personality)) || '{}')
    if (cached.text && Date.now() - cached.time < CACHE_TTL &&
        (alertSig == null || (cached.alertSig ?? '') === alertSig)) return cached.text
  } catch {}
  return null
}

export default function WeatherBriefing({ observation, forecast, hourly, alerts, locationName, refreshKey }) {
  const [personality, setPersonality] = useState(getSavedPersonality)
  const [briefing, setBriefing] = useState(() => getCachedBriefing(getSavedPersonality()))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const lastRequestRef = useRef(null)
  const currentPersonality = PERSONALITIES.find(p => p.key === personality) || PERSONALITIES[0]
  // Event types, not alert ids: NWS issues a new id for every update to the
  // same warning, which would regenerate the briefing each time
  const alertSig = alerts ? [...new Set(alerts.map(a => a.event))].sort().join('|') : null

  // One request per (personality, alerts, app refresh, location, manual retry).
  // Previously a ref latched after the first fetch and only a location change
  // cleared it, so the header refresh and the 10-min refresh never updated it.
  // The 30-min cache still rate-limits the periodic refreshes.
  useEffect(() => {
    const cached = getCachedBriefing(personality, alertSig ?? '')
    if (cached) {
      lastRequestRef.current = null // any request still in flight no longer owns the card
      setBriefing(cached)
      setError(null)
      setLoading(false)
      return
    }
    if (!observation || !forecast) return
    const requestKey = [personality, alertSig, refreshKey, locationName, retryNonce].join('§')
    if (lastRequestRef.current === requestKey) return
    lastRequestRef.current = requestKey

    setLoading(true)
    setError(null) // a past failure must not mask this attempt's result
    const context = buildContext(observation, forecast, hourly, alerts, locationName)

    const isCurrent = () => lastRequestRef.current === requestKey
    fetch(BRIEFING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, personality }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined,
    })
      .then(r => r.json())
      .then(data => {
        if (data.briefing) {
          localStorage.setItem(getCacheKey(personality), JSON.stringify({ text: data.briefing, time: Date.now(), alertSig: alertSig ?? '' }))
          if (!isCurrent()) return // a newer request (e.g. personality switch) owns the card
          setBriefing(data.briefing)
          setError(null)
        } else if (isCurrent()) {
          setError('Could not generate briefing')
        }
      })
      .catch(() => { if (isCurrent()) setError('Briefing unavailable') })
      .finally(() => { if (isCurrent()) setLoading(false) })
  }, [observation, forecast, hourly, alerts, alertSig, locationName, personality, refreshKey, retryNonce])

  const handlePersonalityChange = (key) => {
    setPersonality(key)
    localStorage.setItem(PERSONALITY_KEY, key)
    const cached = getCachedBriefing(key)
    setBriefing(cached)
    setError(null)
  }

  const handleRefresh = () => {
    localStorage.removeItem(getCacheKey(personality))
    setBriefing(null)
    setError(null)
    setRetryNonce(n => n + 1)
  }

  if (!observation && !forecast) return null

  return (
    <section className="mb-6">
      <div className="glass-card-accent p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{currentPersonality.emoji}</span>
            <h3 className="text-accent text-[11px] font-medium uppercase tracking-[0.08em]">{currentPersonality.label}</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {PERSONALITIES.map(p => (
                <button
                  key={p.key}
                  onClick={() => handlePersonalityChange(p.key)}
                  title={p.name}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all ${
                    personality === p.key
                      ? 'bg-accent/20 ring-1 ring-accent scale-110'
                      : 'hover:bg-white/5 opacity-60 hover:opacity-100'
                  }`}
                >
                  {p.emoji}
                </button>
              ))}
            </div>
            {briefing && (
              <button onClick={handleRefresh} className="text-text-muted text-[10px] hover:text-accent transition-colors">
                Refresh
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <div className="w-4 h-4 border border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-text-dim text-sm">{currentPersonality.loading}</span>
          </div>
        ) : error ? (
          <p className="text-text-muted text-sm">{error}</p>
        ) : briefing ? (
          <p className="text-text/90 text-[0.9rem] leading-relaxed">{briefing}</p>
        ) : null}
      </div>
    </section>
  )
}

function buildContext(obs, forecast, hourly, alerts, location) {
  const parts = [`Location: ${location || 'Unknown'}`]

  if (obs) {
    parts.push(`Current: ${obs.temperature}°F, ${obs.description || 'no weather reported'}, Wind ${obs.windSpeed} mph${obs.windGust ? ` gusting ${obs.windGust}` : ''}, Humidity ${obs.humidity}%`)
  }

  if (alerts?.length) {
    parts.push(`Active alerts: ${alerts.map(a => `${a.severity} ${a.event}`).join('; ')}`)
  }

  if (hourly?.length) {
    const next6 = hourly.slice(0, 6).map(h => {
      const t = new Date(h.startTime)
      return `${getCentralHour(t)}:00=${h.temperature}°F ${h.shortForecast}`
    })
    parts.push(`Next 6hr: ${next6.join(', ')}`)
  }

  if (forecast?.length) {
    const next3 = forecast.slice(0, 3).map(p => `${p.name}: ${p.temperature}°${p.temperatureUnit} ${p.shortForecast}`)
    parts.push(`Forecast: ${next3.join('; ')}`)
  }

  return parts.join('\n')
}
