import { useState } from 'react'
import { getHourLabel, getCentralHour, formatDate, formatTime } from '../timezone'

function shortEmoji(forecast) {
  if (!forecast) return ''
  const f = forecast.toLowerCase()
  if (f.includes('thunder') || f.includes('storm')) return '⛈️'
  if (f.includes('rain') || f.includes('shower') || f.includes('drizzle')) return '🌧️'
  if (f.includes('snow') || f.includes('sleet') || f.includes('ice')) return '🌨️'
  if (f.includes('fog') || f.includes('haze') || f.includes('mist')) return '🌫️'
  if (f.includes('cloudy') || f.includes('overcast')) return '☁️'
  if (f.includes('partly')) return '⛅'
  if (f.includes('mostly sunny') || f.includes('mostly clear')) return '🌤️'
  if (f.includes('sunny') || f.includes('clear')) return '☀️'
  return '🌤️'
}

function dewpointF(period) {
  const c = period.dewpoint?.value
  return c == null ? null : Math.round(c * 9 / 5 + 32)
}

export default function HourlyForecast({ periods }) {
  const [selected, setSelected] = useState(null)
  if (!periods?.length) return null

  const items = periods.slice(0, 48)
  const sel = selected != null ? items[selected] : null

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em]">48-Hour Forecast</h2>
        <span className="text-text-muted text-[10px]">tap an hour for details</span>
      </div>
      <div className="glass-card p-4">
        <div className="scroll-x flex gap-1">
          {items.map((p, i) => {
            const precip = p.probabilityOfPrecipitation?.value ?? 0
            const isNow = i === 0
            const isSelected = selected === i
            const isMidnight = i > 0 && getCentralHour(new Date(p.startTime)) === 0
            return (
              <div key={i} className="flex flex-shrink-0">
                {isMidnight && (
                  <div className="flex flex-col items-center justify-center px-1.5 mx-1 border-l border-white/[0.08]">
                    <span className="text-[10px] text-text-muted font-medium uppercase tracking-wide" style={{ writingMode: 'vertical-rl' }}>
                      {formatDate(new Date(p.startTime), { weekday: 'short' })}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setSelected(isSelected ? null : i)}
                  className={`flex flex-col items-center flex-shrink-0 min-w-[3.5rem] py-1 px-1 rounded-xl transition-colors ${
                    isSelected ? 'bg-accent/[0.15] ring-1 ring-accent/40' : isNow ? 'bg-accent/[0.07]' : ''
                  }`}
                >
                  <span className={`text-xs mb-2 ${isNow ? 'text-accent font-medium' : 'text-text-muted'}`}>
                    {isNow ? 'Now' : getHourLabel(p.startTime)}
                  </span>
                  <span className="text-xl mb-1">{shortEmoji(p.shortForecast)}</span>
                  {precip > 0 ? (
                    <span className="text-accent text-[10px] mb-1">{precip}%</span>
                  ) : (
                    <span className="text-[10px] mb-1">&nbsp;</span>
                  )}
                  <span className={`font-medium text-sm tabular-nums ${isNow ? 'text-text' : 'text-text/90'}`}>{p.temperature}°</span>
                </button>
              </div>
            )
          })}
        </div>

        {/* Tapped-hour detail */}
        {sel && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-text text-sm font-medium">
                {formatDate(new Date(sel.startTime), { weekday: 'short' })} {formatTime(new Date(sel.startTime))} — {sel.shortForecast}
              </span>
              <button onClick={() => setSelected(null)} className="text-text-muted text-xs px-1">✕</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="bg-surface/60 rounded-lg py-2">
                <div className="text-[10px] text-text-muted uppercase tracking-wide">Wind</div>
                <div className="text-sm text-text mt-0.5">{sel.windDirection} {sel.windSpeed}</div>
              </div>
              <div className="bg-surface/60 rounded-lg py-2">
                <div className="text-[10px] text-text-muted uppercase tracking-wide">Precip</div>
                <div className="text-sm text-text mt-0.5">{sel.probabilityOfPrecipitation?.value ?? 0}%</div>
              </div>
              <div className="bg-surface/60 rounded-lg py-2">
                <div className="text-[10px] text-text-muted uppercase tracking-wide">Humidity</div>
                <div className="text-sm text-text mt-0.5">{sel.relativeHumidity?.value != null ? `${sel.relativeHumidity.value}%` : '--'}</div>
              </div>
              <div className="bg-surface/60 rounded-lg py-2">
                <div className="text-[10px] text-text-muted uppercase tracking-wide">Dewpoint</div>
                <div className="text-sm text-text mt-0.5">{dewpointF(sel) != null ? `${dewpointF(sel)}°` : '--'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
