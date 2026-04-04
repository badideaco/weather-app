function getHourLabel(iso) {
  const d = new Date(iso)
  const h = d.getHours()
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
}

function shortEmoji(forecast) {
  if (!forecast) return ''
  const f = forecast.toLowerCase()
  if (f.includes('thunder') || f.includes('storm')) return '\u26C8\uFE0F'
  if (f.includes('rain') || f.includes('shower') || f.includes('drizzle')) return '\uD83C\uDF27\uFE0F'
  if (f.includes('snow') || f.includes('sleet') || f.includes('ice')) return '\uD83C\uDF28\uFE0F'
  if (f.includes('fog') || f.includes('haze') || f.includes('mist')) return '\uD83C\uDF2B\uFE0F'
  if (f.includes('cloudy') || f.includes('overcast')) return '\u2601\uFE0F'
  if (f.includes('partly')) return '\u26C5'
  if (f.includes('mostly sunny') || f.includes('mostly clear')) return '\uD83C\uDF24\uFE0F'
  if (f.includes('sunny') || f.includes('clear')) return '\u2600\uFE0F'
  return '\uD83C\uDF24\uFE0F'
}

function extractPrecipChance(detail) {
  if (!detail) return null
  const match = detail.match(/(\d+)\s*percent/i)
  return match ? parseInt(match[1]) : null
}

export default function HourlyForecast({ periods }) {
  if (!periods?.length) return null

  const items = periods.slice(0, 24)

  return (
    <section className="mb-6">
      <h2 className="text-text-dim text-xs font-semibold uppercase tracking-wider mb-3 px-1">Hourly Forecast</h2>
      <div className="bg-surface/60 rounded-2xl border border-border/40 p-4">
        <div className="scroll-x flex gap-4">
          {items.map((p, i) => {
            const precip = extractPrecipChance(p.detailedForecast)
            return (
              <div key={i} className="flex flex-col items-center flex-shrink-0 min-w-[3.5rem]">
                <span className="text-text-muted text-xs mb-2">
                  {i === 0 ? 'Now' : getHourLabel(p.startTime)}
                </span>
                <span className="text-xl mb-1">{shortEmoji(p.shortForecast)}</span>
                {precip != null && precip > 0 && (
                  <span className="text-accent text-[10px] mb-1">{precip}%</span>
                )}
                <span className="text-text font-medium text-sm">{p.temperature}°</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
