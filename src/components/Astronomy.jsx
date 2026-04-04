import { useState, useEffect, useMemo } from 'react'
import SunCalc from 'suncalc'
import { getAPOD } from '../api'

function formatTime(date) {
  if (!date || isNaN(date.getTime())) return '--'
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function getMoonPhaseName(phase) {
  if (phase < 0.03 || phase >= 0.97) return 'New Moon'
  if (phase < 0.22) return 'Waxing Crescent'
  if (phase < 0.28) return 'First Quarter'
  if (phase < 0.47) return 'Waxing Gibbous'
  if (phase < 0.53) return 'Full Moon'
  if (phase < 0.72) return 'Waning Gibbous'
  if (phase < 0.78) return 'Last Quarter'
  return 'Waning Crescent'
}

function getMoonEmoji(phase) {
  if (phase < 0.03 || phase >= 0.97) return '\uD83C\uDF11'
  if (phase < 0.22) return '\uD83C\uDF12'
  if (phase < 0.28) return '\uD83C\uDF13'
  if (phase < 0.47) return '\uD83C\uDF14'
  if (phase < 0.53) return '\uD83C\uDF15'
  if (phase < 0.72) return '\uD83C\uDF16'
  if (phase < 0.78) return '\uD83C\uDF17'
  return '\uD83C\uDF18'
}

function ISSTracker() {
  const [iss, setIss] = useState(null)

  useEffect(() => {
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(r => r.json())
      .then(data => setIss({ lat: data.latitude, lon: data.longitude, alt: Math.round(data.altitude * 0.621371) }))
      .catch(() => {})
  }, [])

  if (!iss) return null

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xl">\uD83D\uDEF0\uFE0F</span>
      <div>
        <div className="text-text text-sm font-medium">ISS Position</div>
        <div className="text-text-muted text-xs">
          {iss.lat.toFixed(1)}°, {iss.lon.toFixed(1)}° at {iss.alt} mi altitude
        </div>
      </div>
    </div>
  )
}

export default function Astronomy({ lat, lon }) {
  const [apod, setApod] = useState(null)
  const [showApod, setShowApod] = useState(false)

  const sunMoon = useMemo(() => {
    const now = new Date()
    const times = SunCalc.getTimes(now, lat, lon)
    const moonIllum = SunCalc.getMoonIllumination(now)
    const moonTimes = SunCalc.getMoonTimes(now, lat, lon)
    const sunPos = SunCalc.getPosition(now, lat, lon)
    const altDeg = sunPos.altitude * (180 / Math.PI)

    // Golden hour: sun altitude between -4 and 6 degrees
    const isGoldenHour = altDeg > -4 && altDeg < 6 && altDeg > -90

    // Daylight duration
    const daylight = times.sunset && times.sunrise
      ? (times.sunset - times.sunrise) / 3600000
      : null

    return {
      sunrise: times.sunrise,
      sunset: times.sunset,
      goldenHour: times.goldenHour,
      goldenHourEnd: times.goldenHourEnd,
      dawn: times.dawn,
      dusk: times.dusk,
      solarNoon: times.solarNoon,
      isGoldenHour,
      daylight,
      moonPhase: moonIllum.phase,
      moonFraction: moonIllum.fraction,
      moonrise: moonTimes.rise,
      moonset: moonTimes.set,
    }
  }, [lat, lon])

  useEffect(() => {
    getAPOD().then(setApod).catch(() => {})
  }, [])

  // Sun progress (0-1 through the day)
  const now = new Date()
  const sunProgress = sunMoon.sunrise && sunMoon.sunset
    ? Math.max(0, Math.min(1, (now - sunMoon.sunrise) / (sunMoon.sunset - sunMoon.sunrise)))
    : 0.5
  const isDaytime = sunProgress > 0 && sunProgress < 1

  return (
    <section className="mb-6">
      <h2 className="text-text-dim text-xs font-semibold uppercase tracking-wider mb-3 px-1">Astronomy</h2>
      <div className="bg-surface/60 rounded-2xl border border-border/40 p-4 space-y-4">
        {/* Sun Arc */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-center">
              <div className="text-text-muted text-[10px]">Sunrise</div>
              <div className="text-text text-sm font-medium">{formatTime(sunMoon.sunrise)}</div>
            </div>
            <div className="text-center">
              <div className="text-text-muted text-[10px]">Solar Noon</div>
              <div className="text-text text-sm font-medium">{formatTime(sunMoon.solarNoon)}</div>
            </div>
            <div className="text-center">
              <div className="text-text-muted text-[10px]">Sunset</div>
              <div className="text-text text-sm font-medium">{formatTime(sunMoon.sunset)}</div>
            </div>
          </div>
          {/* Sun arc visualization */}
          <div className="relative h-12 mx-4">
            <svg viewBox="0 0 200 50" className="w-full h-full">
              {/* Arc path */}
              <path
                d="M10 45 Q100 -10 190 45"
                fill="none"
                stroke="#2a2a4a"
                strokeWidth="2"
              />
              {/* Filled portion */}
              {isDaytime && (
                <circle
                  cx={10 + sunProgress * 180}
                  cy={45 - Math.sin(sunProgress * Math.PI) * 50}
                  r="6"
                  fill="#ff9800"
                />
              )}
              {/* Horizon line */}
              <line x1="5" y1="45" x2="195" y2="45" stroke="#2a2a4a" strokeWidth="0.5" />
            </svg>
          </div>
          <div className="flex justify-between text-text-muted text-[10px] px-2">
            <span>Dawn {formatTime(sunMoon.dawn)}</span>
            {sunMoon.daylight && (
              <span>{sunMoon.daylight.toFixed(1)}h daylight</span>
            )}
            <span>Dusk {formatTime(sunMoon.dusk)}</span>
          </div>
        </div>

        {/* Moon */}
        <div className="flex items-center gap-4 pt-2 border-t border-border/30">
          <div className="text-4xl">{getMoonEmoji(sunMoon.moonPhase)}</div>
          <div className="flex-1">
            <div className="text-text font-medium text-sm">{getMoonPhaseName(sunMoon.moonPhase)}</div>
            <div className="text-text-muted text-xs">
              {Math.round(sunMoon.moonFraction * 100)}% illuminated
            </div>
            <div className="text-text-muted text-xs">
              {sunMoon.moonrise && `Rise ${formatTime(sunMoon.moonrise)}`}
              {sunMoon.moonrise && sunMoon.moonset && ' \u00B7 '}
              {sunMoon.moonset && `Set ${formatTime(sunMoon.moonset)}`}
            </div>
          </div>
        </div>

        {/* Golden Hour Alert */}
        {sunMoon.isGoldenHour && (
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-300 text-xs">
            Golden hour is happening now! Great for photography.
          </div>
        )}

        {/* ISS */}
        <div className="border-t border-border/30 pt-2">
          <ISSTracker />
        </div>

        {/* NASA APOD */}
        {apod && (
          <div className="border-t border-border/30 pt-3">
            <button
              onClick={() => setShowApod(!showApod)}
              className="text-left w-full"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">\uD83C\uDF0C</span>
                <div className="flex-1 min-w-0">
                  <div className="text-text text-sm font-medium">NASA Picture of the Day</div>
                  <div className="text-text-muted text-xs truncate">{apod.title}</div>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  className={`w-4 h-4 text-text-muted transition-transform ${showApod ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </button>
            {showApod && apod.mediaType === 'image' && (
              <div className="mt-3">
                <img
                  src={apod.url}
                  alt={apod.title}
                  className="w-full rounded-lg"
                  loading="lazy"
                />
                <p className="text-text-muted text-xs mt-2 leading-relaxed line-clamp-4">
                  {apod.explanation}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
