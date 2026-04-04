import { useState, useEffect, useRef } from 'react'

const BRIEFING_URL = 'https://4pi2u7nqpftngmhbscfu2d3y6m0zugjo.lambda-url.us-east-2.on.aws'
const CACHE_KEY = 'stormscope-briefing'
const CACHE_TTL = 30 * 60 * 1000 // 30 min cache

function getCachedBriefing() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    if (cached.text && Date.now() - cached.time < CACHE_TTL) return cached.text
  } catch {}
  return null
}

export default function WeatherBriefing({ observation, forecast, hourly, alerts, locationName }) {
  const [briefing, setBriefing] = useState(getCachedBriefing)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current || briefing || !observation || !forecast) return
    fetchedRef.current = true

    const cached = getCachedBriefing()
    if (cached) { setBriefing(cached); return }

    setLoading(true)
    const context = buildContext(observation, forecast, hourly, alerts, locationName)

    fetch(BRIEFING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.briefing) {
          setBriefing(data.briefing)
          localStorage.setItem(CACHE_KEY, JSON.stringify({ text: data.briefing, time: Date.now() }))
        } else {
          setError('Could not generate briefing')
        }
      })
      .catch(() => setError('Briefing unavailable'))
      .finally(() => setLoading(false))
  }, [observation, forecast, hourly, alerts, locationName, briefing])

  const handleRefresh = () => {
    localStorage.removeItem(CACHE_KEY)
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
            <span className="text-lg">{"🤖"}</span>
            <h3 className="text-accent text-[11px] font-medium uppercase tracking-[0.08em]">AI Weather Briefing</h3>
          </div>
          {briefing && (
            <button onClick={handleRefresh} className="text-text-muted text-[10px] hover:text-accent transition-colors">
              Refresh
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <div className="w-4 h-4 border border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-text-dim text-sm">Analyzing conditions...</span>
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
      return `${t.getHours()}:00=${h.temperature}°F ${h.shortForecast}`
    })
    parts.push(`Next 6hr: ${next6.join(', ')}`)
  }

  if (forecast?.length) {
    const next3 = forecast.slice(0, 3).map(p => `${p.name}: ${p.temperature}°${p.temperatureUnit} ${p.shortForecast}`)
    parts.push(`Forecast: ${next3.join('; ')}`)
  }

  return parts.join('\n')
}
