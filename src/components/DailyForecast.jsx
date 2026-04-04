function shortEmoji(forecast) {
  if (!forecast) return ''
  const f = forecast.toLowerCase()
  if (f.includes('thunder') || f.includes('storm')) return '\u26C8\uFE0F'
  if (f.includes('rain') || f.includes('shower') || f.includes('drizzle')) return '\uD83C\uDF27\uFE0F'
  if (f.includes('snow') || f.includes('sleet') || f.includes('ice')) return '\uD83C\uDF28\uFE0F'
  if (f.includes('fog') || f.includes('haze')) return '\uD83C\uDF2B\uFE0F'
  if (f.includes('cloudy') || f.includes('overcast')) return '\u2601\uFE0F'
  if (f.includes('partly')) return '\u26C5'
  if (f.includes('mostly sunny') || f.includes('mostly clear')) return '\uD83C\uDF24\uFE0F'
  if (f.includes('sunny') || f.includes('clear')) return '\u2600\uFE0F'
  return '\uD83C\uDF24\uFE0F'
}

function extractPrecipChance(period) {
  // Use direct probabilityOfPrecipitation field first, fall back to text parsing
  if (period?.probabilityOfPrecipitation?.value != null) return period.probabilityOfPrecipitation.value
  const detail = period?.detailedForecast
  if (!detail) return null
  const match = detail.match(/(\d+)\s*percent/i)
  return match ? parseInt(match[1]) : null
}

import { TZ } from '../timezone'

function getDayName(iso, index) {
  if (index === 0) return 'Today'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ })
}

export default function DailyForecast({ periods }) {
  if (!periods?.length) return null

  // Group into day/night pairs
  const days = []
  let i = 0
  // Skip the first period if it's a night (Tonight) — pair it alone
  if (!periods[0]?.isDaytime) {
    days.push({ name: periods[0].name, high: null, low: periods[0].temperature, forecast: periods[0].shortForecast, period: periods[0], startTime: periods[0].startTime })
    i = 1
  }
  while (i < periods.length) {
    const day = periods[i]
    const night = periods[i + 1]
    days.push({
      name: day.name,
      high: day?.temperature,
      low: night?.temperature ?? null,
      forecast: day?.shortForecast,
      period: day,
      startTime: day?.startTime,
    })
    i += 2
  }

  // Find overall min/max for temperature bars
  const allTemps = days.flatMap(d => [d.high, d.low]).filter(t => t != null)
  const minTemp = Math.min(...allTemps)
  const maxTemp = Math.max(...allTemps)
  const range = maxTemp - minTemp || 1

  return (
    <section className="mb-6">
      <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3 px-1">7-Day Forecast</h2>
      <div className="glass-card divide-premium">
        {days.slice(0, 7).map((day, idx) => {
          const precip = extractPrecipChance(day.period)
          const barLeft = day.low != null ? ((day.low - minTemp) / range) * 100 : day.high != null ? ((day.high - minTemp) / range) * 100 : 0
          const barRight = day.high != null ? ((day.high - minTemp) / range) * 100 : barLeft
          const barColor = day.high > 85 ? '#ff9800' : day.high > 70 ? '#66bb6a' : '#4fc3f7'
          return (
            <div key={idx} className="flex items-center gap-3 px-4 py-3.5 row-hover">
              <span className="text-text-dim text-sm w-12 flex-shrink-0">
                {getDayName(day.startTime, idx)}
              </span>
              <span className="text-lg w-8 text-center flex-shrink-0">
                {shortEmoji(day.forecast)}
              </span>
              <span className="text-text-dim text-sm w-8 text-right flex-shrink-0 tabular-nums">
                {day.low != null ? `${day.low}°` : ''}
              </span>
              {/* Temperature bar */}
              <div className="flex-1 h-2 bg-white/[0.04] rounded-full relative mx-1">
                <div
                  className="absolute h-full rounded-full"
                  style={{
                    left: `${barLeft}%`,
                    width: `${Math.max(barRight - barLeft, 4)}%`,
                    background: `linear-gradient(90deg, #4fc3f7, ${barColor})`,
                    boxShadow: `0 0 10px ${barColor}33`,
                  }}
                />
              </div>
              <span className="text-text text-sm w-8 flex-shrink-0 tabular-nums">
                {day.high != null ? `${day.high}°` : ''}
              </span>
              {precip != null && precip > 0 ? (
                <span className="text-accent text-xs w-8 text-right flex-shrink-0 tabular-nums">{precip}%</span>
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
