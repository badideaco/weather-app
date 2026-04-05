import { useState, useEffect } from 'react'
import { getExtendedForecast } from '../api'
import { TZ } from '../timezone'

const WMO_EMOJI = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌧️', 55: '🌧️',
  56: '🌧️', 57: '🌧️',             // freezing drizzle
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  66: '🌧️', 67: '🌧️',             // freezing rain
  71: '🌨️', 73: '🌨️', 75: '🌨️',
  77: '🌨️',                         // snow grains
  80: '🌧️', 81: '🌧️', 82: '🌧️',
  85: '🌨️', 86: '🌨️',             // snow showers
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}

function getDayName(dateStr, i) {
  if (i === 0) return 'Today'
  if (i === 1) return 'Tmrw'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ })
}

export default function ExtendedForecast({ lat, lon }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getExtendedForecast(lat, lon)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [lat, lon])

  if (loading || !data?.length) return null

  // Show days 8-16 (the extended part, since NWS covers 1-7)
  const extended = data.slice(7)
  if (!extended.length) return null

  const allTemps = extended.flatMap(d => [d.high, d.low]).filter(t => t != null)
  const minTemp = Math.min(...allTemps)
  const maxTemp = Math.max(...allTemps)
  const range = maxTemp - minTemp || 1

  // Total expected precipitation
  const totalPrecip = extended.reduce((sum, d) => sum + (d.precipAmount || 0), 0)

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em]">Extended Outlook</h2>
        <span className="text-text-muted text-xs">
          {totalPrecip > 0 ? `${totalPrecip.toFixed(2)}" precip expected` : 'Days 8-16'}
        </span>
      </div>
      <div className="glass-card divide-premium">
        {extended.map((day, idx) => {
          const barLeft = day.low != null ? ((day.low - minTemp) / range) * 100 : 0
          const barRight = day.high != null ? ((day.high - minTemp) / range) * 100 : barLeft
          const barColor = day.high > 85 ? '#ff9800' : day.high > 70 ? '#66bb6a' : '#4fc3f7'
          return (
            <div key={day.date} className="flex items-center gap-3 px-4 py-3 row-hover">
              <span className="text-text-dim text-sm w-10 flex-shrink-0">
                {getDayName(day.date, idx + 7)}
              </span>
              <span className="text-xs text-text-muted w-10 flex-shrink-0">
                {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })}
              </span>
              <span className="text-base w-7 text-center flex-shrink-0">
                {WMO_EMOJI[day.code] || '☁️'}
              </span>
              <span className="text-text-dim text-sm w-8 text-right flex-shrink-0 tabular-nums">{day.low}°</span>
              <div className="flex-1 h-2 bg-white/[0.04] rounded-full relative mx-1">
                <div className="absolute h-full rounded-full"
                  style={{
                    left: `${barLeft}%`,
                    width: `${Math.max(barRight - barLeft, 4)}%`,
                    background: `linear-gradient(90deg, #4fc3f7, ${barColor})`,
                    boxShadow: `0 0 10px ${barColor}33`,
                  }}
                />
              </div>
              <span className="text-text text-sm w-8 flex-shrink-0">{day.high}°</span>
              {day.precipProb > 0 ? (
                <span className="text-accent text-xs w-8 text-right flex-shrink-0">{day.precipProb}%</span>
              ) : (
                <span className="w-8 flex-shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
