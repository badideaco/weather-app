import { useState, useEffect, useRef } from 'react'
import { getCentralHour } from '../timezone'

const BRIEFING_URL = 'https://4pi2u7nqpftngmhbscfu2d3y6m0zugjo.lambda-url.us-east-2.on.aws'
const CACHE_PREFIX = 'stormscope-briefing'
const CACHE_TTL = 30 * 60 * 1000 // 30 min cache
const PERSONALITY_KEY = 'stormscope-personality'

const PERSONALITIES = [
  { key: 'elmer', name: 'Elmer', emoji: '\u{1F474}', label: 'Old Man Weather', loading: 'Grumbling about the weather...' },
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

function getCachedBriefing(personality) {
  try {
    const cached = JSON.parse(localStorage.getItem(getCacheKey(personality)) || '{}')
    if (cached.text && Date.now() - cached.time < CACHE_TTL) return cached.text
  } catch {}
  return null
}

export default function WeatherBriefing({ observation, forecast, hourly, alerts, locationName }) {
  const [personality, setPersonality] = useState(getSavedPersonality)
  const [briefing, setBriefing] = useState(() => getCachedBriefing(getSavedPersonality()))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fetchedRef = useRef(false)
  const currentPersonality = PERSONALITIES.find(p => p.key === personality) || PERSONALITIES[0]

  useEffect(() => {
    const cached = getCachedBriefing(personality)
    if (cached) { setBriefing(cached); return }
    if (fetchedRef.current || !observation || !forecast) return
    fetchedRef.current = true

    setLoading(true)
    const context = buildContext(observation, forecast, hourly, alerts, locationName)

    fetch(BRIEFING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, personality }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.briefing) {
          setBriefing(data.briefing)
          localStorage.setItem(getCacheKey(personality), JSON.stringify({ text: data.briefing, time: Date.now() }))
        } else {
          setError('Could not generate briefing')
        }
      })
      .catch(() => setError('Briefing unavailable'))
      .finally(() => setLoading(false))
  }, [observation, forecast, hourly, alerts, locationName, personality])

  const handlePersonalityChange = (key) => {
    setPersonality(key)
    localStorage.setItem(PERSONALITY_KEY, key)
    const cached = getCachedBriefing(key)
    setBriefing(cached)
    setError(null)
    fetchedRef.current = false
  }

  const handleRefresh = () => {
    localStorage.removeItem(getCacheKey(personality))
    setBriefing(null)
    fetchedRef.current = false
    setError(null)
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
    parts.push(`Current: ${obs.temperature}°F, ${obs.description}, Wind ${obs.windSpeed} mph${obs.windGust ? ` gusting ${obs.windGust}` : ''}, Humidity ${obs.humidity}%`)
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
