import { degreesToCardinal } from '../api'

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
      <div className="text-text-muted text-xs mb-1">{label}</div>
      <div className="text-text font-medium text-sm">{value}{unit || ''}</div>
    </div>
  )
}

export default function CurrentWeather({ observation, period, forecast }) {
  const temp = observation?.temperature ?? period?.temperature
  const desc = observation?.description || period?.shortForecast || ''
  const feelsLike = observation?.heatIndex || observation?.windChill

  // Get today's high/low from forecast periods
  let high = null, low = null
  if (forecast) {
    for (const p of forecast.slice(0, 4)) {
      if (p.isDaytime && high == null) high = p.temperature
      if (!p.isDaytime && low == null) low = p.temperature
    }
  }

  return (
    <section className="mt-6 mb-6">
      {/* Main temp display */}
      <div className="text-center mb-6">
        <div className="text-5xl mb-2">{getEmoji(desc)}</div>
        <div className="text-8xl font-extralight tracking-tighter text-text leading-none">
          {temp != null ? `${temp}°` : '--'}
        </div>
        <div className="text-text-dim text-lg mt-2">{desc}</div>
        <div className="flex items-center justify-center gap-4 mt-2 text-sm">
          {feelsLike != null && feelsLike !== temp && (
            <span className="text-text-dim">Feels like {feelsLike}°</span>
          )}
          {high != null && <span className="text-text">H: {high}°</span>}
          {low != null && <span className="text-text-dim">L: {low}°</span>}
        </div>
      </div>

      {/* Detail grid */}
      {observation && (
        <div className="bg-surface/60 rounded-2xl border border-border/40 p-4">
          <div className="grid grid-cols-3 gap-4">
            <DetailItem
              label="Wind"
              value={observation.windSpeed != null ? `${observation.windSpeed} ${degreesToCardinal(observation.windDirection)}` : null}
              unit=" mph"
            />
            <DetailItem label="Humidity" value={observation.humidity} unit="%" />
            <DetailItem label="Dewpoint" value={observation.dewpoint} unit="°F" />
            <DetailItem label="Pressure" value={observation.pressure} unit="&quot;" />
            <DetailItem label="Visibility" value={observation.visibility} unit=" mi" />
            <DetailItem
              label="Gusts"
              value={observation.windGust}
              unit={observation.windGust ? ' mph' : ''}
            />
          </div>
        </div>
      )}
    </section>
  )
}
