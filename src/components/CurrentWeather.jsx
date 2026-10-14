import { degreesToCardinal } from '../api'
import { relativeLabel, TZ } from '../timezone'

const conditionEmoji = {
  'Sunny': '\u2600\uFE0F', 'Mostly Sunny': '\uD83C\uDF24\uFE0F', 'Partly Sunny': '\u26C5',
  'Mostly Cloudy': '\uD83C\uDF25\uFE0F', 'Cloudy': '\u2601\uFE0F', 'Overcast': '\u2601\uFE0F',
  'Clear': '\uD83C\uDF19', 'Mostly Clear': '\uD83C\uDF19', 'Partly Cloudy': '\u26C5',
  'Rain': '\uD83C\uDF27\uFE0F', 'Light Rain': '\uD83C\uDF26\uFE0F', 'Heavy Rain': '\uD83C\uDF27\uFE0F',
  'Showers': '\uD83C\uDF27\uFE0F', 'Rain Showers': '\uD83C\uDF27\uFE0F',
  'Thunderstorm': '\u26C8\uFE0F', 'Thunderstorms': '\u26C8\uFE0F',
  'Snow': '\uD83C\uDF28\uFE0F', 'Light Snow': '\uD83C\uDF28\uFE0F', 'Heavy Snow': '\uD83C\uDF28\uFE0F',
  'Sleet': '\uD83C\uDF28\uFE0F', 'Freezing Rain': '\uD83C\uDF28\uFE0F',
  'Fog': '\uD83C\uDF2B\uFE0F', 'Haze': '\uD83C\uDF2B\uFE0F', 'Smoke': '\uD83C\uDF2B\uFE0F',
  'Windy': '\uD83D\uDCA8', 'Breezy': '\uD83D\uDCA8',
  'Hot': '\uD83E\uDD75', 'Cold': '\uD83E\uDD76',
}

function getEmoji(description) {
  if (!description) return '\uD83C\uDF24\uFE0F'
  for (const [key, emoji] of Object.entries(conditionEmoji)) {
    if (description.toLowerCase().includes(key.toLowerCase())) return emoji
  }
  if (description.toLowerCase().includes('rain') || description.toLowerCase().includes('shower')) return '\uD83C\uDF27\uFE0F'
  if (description.toLowerCase().includes('cloud')) return '\u2601\uFE0F'
  if (description.toLowerCase().includes('snow')) return '\uD83C\uDF28\uFE0F'
  if (description.toLowerCase().includes('storm') || description.toLowerCase().includes('thunder')) return '\u26C8\uFE0F'
  return '\uD83C\uDF24\uFE0F'
}

function DetailItem({ label, value, unit }) {
  if (value == null) return null
  return (
    <div className="text-center">
      <div className="text-text-muted text-[11px] mb-1.5 tracking-wide">{label}</div>
      <div className="text-text font-medium text-sm tabular-nums">{value}{unit || ''}</div>
    </div>
  )
}

function dewpointComfort(dp) {
  if (dp == null) return null
  if (dp >= 75) return { text: 'Oppressive', color: '#ef4444' }
  if (dp >= 70) return { text: 'Muggy', color: '#f97316' }
  if (dp >= 65) return { text: 'Sticky', color: '#eab308' }
  if (dp >= 60) return { text: 'Humid', color: '#66bb6a' }
  if (dp >= 50) return { text: 'Comfortable', color: '#4fc3f7' }
  return { text: 'Dry', color: '#8888a8' }
}

// 3-hour change at the same station, in inHg. ~1 hPa (0.03") is within the
// daily pressure tide; ~3.4 hPa (0.10") in 3 h is a fast change. The old
// version compared NWS sea-level pressure with Open-Meteo's unreduced
// surface_pressure, so it read "Rising rapidly" anywhere inland.
function pressureTrend(diff) {
  if (diff == null) return null
  if (diff >= 0.10) return { text: 'Rising rapidly', icon: '↑↑', color: '#22c55e' }
  if (diff >= 0.03) return { text: 'Rising', icon: '↑', color: '#66bb6a' }
  if (diff <= -0.10) return { text: 'Falling rapidly', icon: '↓↓', color: '#ef4444' }
  if (diff <= -0.03) return { text: 'Falling', icon: '↓', color: '#f97316' }
  return { text: 'Steady', icon: '→', color: '#8888a8' }
}

export default function CurrentWeather({ observation, period, forecast, yesterday }) {
  const temp = observation?.temperature ?? period?.temperature
  const desc = observation?.description || period?.shortForecast || ''
  const feelsLike = observation?.heatIndex || observation?.windChill

  // After dark the next daytime period is tomorrow's: label its high, and don't
  // compare it with yesterday's. Compare dates, not isDaytime: between
  // midnight and ~6 AM the first period is "Overnight" but the high is today's.
  const dayKey = d => d.toLocaleDateString('en-CA', { timeZone: TZ })
  const firstDay = forecast?.slice(0, 4).find(p => p.isDaytime)
  const highIsTomorrow = firstDay?.startTime ? dayKey(new Date(firstDay.startTime)) !== dayKey(new Date()) : false
  let high = null, low = null
  if (forecast) {
    for (const p of forecast.slice(0, 4)) {
      if (p.isDaytime && high == null) high = p.temperature
      if (!p.isDaytime && low == null) low = p.temperature
    }
  }

  const dpComfort = dewpointComfort(observation?.dewpoint)
  const pTrend = pressureTrend(observation?.pressureChange3h)
  const tempDiff = !highIsTomorrow && yesterday?.high != null && high != null ? high - yesterday.high : null

  // Which station reported, and how long ago (hourly airport reports can lag)
  const obsTime = observation?.timestamp ? new Date(observation.timestamp) : null
  const obsAgeMin = obsTime ? (Date.now() - obsTime) / 60000 : null
  const obsStale = obsAgeMin != null && obsAgeMin > 90

  return (
    <section className="mt-6 mb-6">
      <div className="text-center mb-8">
        {/* Weather icon with radial glow */}
        <div className="relative inline-block mb-3">
          <div className="absolute inset-0 scale-[2.5] rounded-full" style={{ background: 'radial-gradient(circle, rgba(79,195,247,0.1) 0%, transparent 70%)' }} />
          <div className="text-5xl relative">{getEmoji(desc)}</div>
        </div>
        {/* Hero temperature */}
        <div className="hero-temp text-text">
          {temp != null ? `${temp}°` : '--'}
        </div>
        <div className="text-text-dim text-lg mt-3 font-light">{desc}</div>
        {observation?.stationId && obsTime && (
          <div className={`text-[11px] mt-1 ${obsStale ? 'text-amber-400/80' : 'text-text-muted'}`} title={observation.stationName || ''}>
            {observation.stationId} report · {relativeLabel(obsTime.getTime() / 1000).toLowerCase()}
            {obsStale && ' (no recent report)'}
          </div>
        )}
        <div className="flex items-center justify-center gap-4 mt-2.5 text-sm flex-wrap">
          {feelsLike != null && feelsLike !== temp && (
            <span className="text-text-muted text-xs">Feels like {feelsLike}°</span>
          )}
          {high != null && <span className="text-text/80 text-sm">{highIsTomorrow ? 'Tomorrow H' : 'H'}: {high}°</span>}
          {low != null && <span className="text-text-dim text-sm">L: {low}°</span>}
          {tempDiff != null && tempDiff !== 0 && (
            <span className={`text-xs ${tempDiff > 0 ? 'text-amber-400/80' : 'text-blue-400/80'}`}>
              {tempDiff > 0 ? `${tempDiff}° warmer` : `${Math.abs(tempDiff)}° cooler`} than yesterday
            </span>
          )}
        </div>
      </div>

      {observation && (
        <div className="glass-card p-5">
          <div className="grid grid-cols-3 gap-5">
            <DetailItem
              label="Wind"
              value={observation.windSpeed != null ? `${observation.windSpeed} ${degreesToCardinal(observation.windDirection)}` : null}
              unit=" mph"
            />
            <DetailItem label="Humidity" value={observation.humidity} unit="%" />
            <div className="text-center">
              <div className="text-text-muted text-[11px] mb-1.5 tracking-wide">Dewpoint</div>
              <div className="text-text font-medium text-sm tabular-nums">{observation.dewpoint}°F</div>
              {dpComfort && <div className="text-[10px] mt-0.5 font-medium" style={{ color: dpComfort.color }}>{dpComfort.text}</div>}
            </div>
            <div className="text-center">
              <div className="text-text-muted text-[11px] mb-1.5 tracking-wide">Pressure</div>
              <div className="text-text font-medium text-sm tabular-nums">{observation.pressure}"</div>
              {pTrend && <div className="text-[10px] mt-0.5 font-medium" style={{ color: pTrend.color }}>{pTrend.icon} {pTrend.text}</div>}
            </div>
            <DetailItem label="Visibility" value={observation.visibility} unit=" mi" />
            <DetailItem label="Gusts" value={observation.windGust} unit={observation.windGust ? ' mph' : ''} />
          </div>
        </div>
      )}
    </section>
  )
}
