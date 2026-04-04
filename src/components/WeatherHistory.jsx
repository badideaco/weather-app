import { useState, useEffect } from 'react'

const WMO_CODES = {
  0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime Fog', 51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
  61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 66: 'Freezing Rain', 67: 'Heavy Freezing Rain',
  71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
  80: 'Light Showers', 81: 'Showers', 82: 'Heavy Showers',
  85: 'Light Snow Showers', 86: 'Heavy Snow Showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ Hail', 99: 'Heavy Thunderstorm w/ Hail',
}

function wmoEmoji(code) {
  if (code <= 1) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 55) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '🌨️'
  if (code <= 82) return '🌧️'
  if (code <= 86) return '🌨️'
  return '⛈️'
}

export default function WeatherHistory({ lat, lon }) {
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    // Last year same date
    const ly = new Date(now)
    ly.setFullYear(ly.getFullYear() - 1)
    const lyStr = ly.toISOString().split('T')[0]

    // 5 years ago
    const y5 = new Date(now)
    y5.setFullYear(y5.getFullYear() - 5)
    const y5Str = y5.toISOString().split('T')[0]

    // 10 years ago
    const y10 = new Date(now)
    y10.setFullYear(y10.getFullYear() - 10)
    const y10Str = y10.toISOString().split('T')[0]

    const dates = [lyStr, y5Str, y10Str]
    const labels = ['Last Year', '5 Years Ago', '10 Years Ago']

    Promise.all(
      dates.map(d =>
        fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${d}&end_date=${d}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto`)
          .then(r => r.json())
          .then(data => ({
            date: d,
            high: data.daily?.temperature_2m_max?.[0],
            low: data.daily?.temperature_2m_min?.[0],
            precip: data.daily?.precipitation_sum?.[0],
            code: data.daily?.weathercode?.[0],
          }))
          .catch(() => null)
      )
    ).then(results => {
      setHistory(results.map((r, i) => r ? { ...r, label: labels[i] } : null).filter(Boolean))
      setLoading(false)
    })
  }, [lat, lon])

  if (loading) return (
    <section className="mb-6">
      <h2 className="text-text-dim text-xs font-semibold uppercase tracking-wider mb-3 px-1">This Day in History</h2>
      <div className="skeleton h-28 rounded-2xl" />
    </section>
  )

  if (!history?.length) return null

  return (
    <section className="mb-6">
      <h2 className="text-text-dim text-xs font-semibold uppercase tracking-wider mb-3 px-1">This Day in History</h2>
      <div className="bg-surface/60 rounded-2xl border border-border/40 divide-y divide-border/30">
        {history.map(h => (
          <div key={h.date} className="flex items-center gap-3 px-4 py-3">
            <span className="text-lg w-8 text-center">{wmoEmoji(h.code)}</span>
            <div className="flex-1 min-w-0">
              <div className="text-text text-sm font-medium">{h.label}</div>
              <div className="text-text-muted text-xs">
                {new Date(h.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {' · '}{WMO_CODES[h.code] || 'Unknown'}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-text text-sm">
                <span className="font-medium">{h.high != null ? `${Math.round(h.high)}°` : '--'}</span>
                <span className="text-text-dim"> / {h.low != null ? `${Math.round(h.low)}°` : '--'}</span>
              </div>
              {h.precip > 0 && (
                <div className="text-accent text-xs">{h.precip.toFixed(2)}" precip</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
