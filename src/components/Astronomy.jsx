import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import SunCalc from 'suncalc'
import * as AstroEngine from 'astronomy-engine'
import { getAPOD } from '../api'
import SkyMap from './SkyMap'

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

const MOON_EMOJIS = ['\u{1F311}','\u{1F312}','\u{1F313}','\u{1F314}','\u{1F315}','\u{1F316}','\u{1F317}','\u{1F318}']
function getMoonEmoji(phase) {
  if (phase < 0.03 || phase >= 0.97) return MOON_EMOJIS[0]
  if (phase < 0.22) return MOON_EMOJIS[1]
  if (phase < 0.28) return MOON_EMOJIS[2]
  if (phase < 0.47) return MOON_EMOJIS[3]
  if (phase < 0.53) return MOON_EMOJIS[4]
  if (phase < 0.72) return MOON_EMOJIS[5]
  if (phase < 0.78) return MOON_EMOJIS[6]
  return MOON_EMOJIS[7]
}

function compassDir(az) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(az / 22.5) % 16]
}

// ── Meteor Shower Calendar ──
const METEOR_SHOWERS = [
  { name: 'Quadrantids', peak: '01-03', rate: 120, parent: '2003 EH1' },
  { name: 'Lyrids', peak: '04-22', rate: 18, parent: 'Thatcher' },
  { name: 'Eta Aquariids', peak: '05-06', rate: 50, parent: 'Halley' },
  { name: 'Delta Aquariids', peak: '07-29', rate: 20, parent: '96P/Machholz' },
  { name: 'Perseids', peak: '08-12', rate: 100, parent: 'Swift-Tuttle' },
  { name: 'Orionids', peak: '10-21', rate: 20, parent: 'Halley' },
  { name: 'Leonids', peak: '11-17', rate: 15, parent: 'Tempel-Tuttle' },
  { name: 'Geminids', peak: '12-14', rate: 150, parent: '3200 Phaethon' },
  { name: 'Ursids', peak: '12-22', rate: 10, parent: '8P/Tuttle' },
]

function getUpcomingShowers() {
  const now = new Date()
  const year = now.getFullYear()
  const results = []
  for (const shower of METEOR_SHOWERS) {
    let peakDate = new Date(`${year}-${shower.peak}T03:00:00`)
    if (peakDate < now) peakDate = new Date(`${year + 1}-${shower.peak}T03:00:00`)
    const daysUntil = Math.ceil((peakDate - now) / 86400000)
    results.push({ ...shower, peakDate, daysUntil })
  }
  return results.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 3)
}

// ── Planet Visibility ──
function getPlanetVisibility(lat, lon) {
  const observer = new AstroEngine.Observer(lat, lon, 0)
  const now = new Date()
  const planets = [
    { name: 'Mercury', body: AstroEngine.Body.Mercury, symbol: '\u263F' },
    { name: 'Venus', body: AstroEngine.Body.Venus, symbol: '\u2640' },
    { name: 'Mars', body: AstroEngine.Body.Mars, symbol: '\u2642' },
    { name: 'Jupiter', body: AstroEngine.Body.Jupiter, symbol: '\u2643' },
    { name: 'Saturn', body: AstroEngine.Body.Saturn, symbol: '\u2644' },
  ]

  return planets.map(p => {
    try {
      const equ = AstroEngine.Equator(p.body, now, observer, true, true)
      const hor = AstroEngine.Horizon(now, observer, equ.ra, equ.dec, 'normal')
      // Get elongation from sun to judge visibility
      const elong = AstroEngine.Elongation(p.body, now)
      return {
        ...p,
        altitude: hor.altitude,
        azimuth: hor.azimuth,
        visible: hor.altitude > 5,
        elongation: elong.elongation,
        magnitude: elong.magnitude ?? null,
      }
    } catch {
      return { ...p, altitude: -90, azimuth: 0, visible: false, elongation: 0 }
    }
  })
}

// ── ISS Position + Upcoming Passes ──
function ISSSection({ lat, lon }) {
  const [iss, setIss] = useState(null)
  const [passes, setPasses] = useState(null)

  useEffect(() => {
    // Current position
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(r => r.json())
      .then(data => setIss({ lat: data.latitude, lon: data.longitude, alt: Math.round(data.altitude * 0.621371) }))
      .catch(() => {})

    // Visible passes (using N2YO API with demo - or fallback to position only)
    // N2YO requires a key, so we'll calculate approximate overhead times
    // For now, show the distance and next potential overhead
    if (lat && lon) {
      fetch('https://api.wheretheiss.at/v1/satellites/25544')
        .then(r => r.json())
        .then(data => {
          const distKm = haversine(lat, lon, data.latitude, data.longitude)
          const distMi = Math.round(distKm * 0.621371)
          setIss(prev => prev ? { ...prev, distance: distMi } : null)
        })
        .catch(() => {})
    }
  }, [lat, lon])

  if (!iss) return null

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xl">{"\uD83D\uDEF0\uFE0F"}</span>
      <div className="flex-1">
        <div className="text-text text-sm font-medium">International Space Station</div>
        <div className="text-text-muted text-xs">
          {iss.lat.toFixed(1)}°, {iss.lon.toFixed(1)}° at {iss.alt} mi altitude
        </div>
        {iss.distance != null && (
          <div className="text-text-muted text-xs">
            {iss.distance < 500
              ? <span className="text-green-400">~{iss.distance} mi away — may be visible overhead!</span>
              : `~${iss.distance.toLocaleString()} mi from you`}
          </div>
        )}
      </div>
    </div>
  )
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Main Component ──
export default function Astronomy({ lat, lon }) {
  const [apod, setApod] = useState(null)
  const [showApod, setShowApod] = useState(false)
  const [showPlanets, setShowPlanets] = useState(false)
  const [showShowers, setShowShowers] = useState(false)
  const [showSkyMap, setShowSkyMap] = useState(false)

  const sunMoon = useMemo(() => {
    const now = new Date()
    const times = SunCalc.getTimes(now, lat, lon)
    const moonIllum = SunCalc.getMoonIllumination(now)
    const moonTimes = SunCalc.getMoonTimes(now, lat, lon)
    const sunPos = SunCalc.getPosition(now, lat, lon)
    const altDeg = sunPos.altitude * (180 / Math.PI)
    const isGoldenHour = altDeg > -4 && altDeg < 6 && altDeg > -90
    const daylight = times.sunset && times.sunrise ? (times.sunset - times.sunrise) / 3600000 : null

    return {
      sunrise: times.sunrise, sunset: times.sunset,
      goldenHour: times.goldenHour, goldenHourEnd: times.goldenHourEnd,
      dawn: times.dawn, dusk: times.dusk, solarNoon: times.solarNoon,
      isGoldenHour, daylight,
      moonPhase: moonIllum.phase, moonFraction: moonIllum.fraction,
      moonrise: moonTimes.rise, moonset: moonTimes.set,
    }
  }, [lat, lon])

  const planets = useMemo(() => getPlanetVisibility(lat, lon), [lat, lon])
  const visiblePlanets = planets.filter(p => p.visible)
  const showers = useMemo(getUpcomingShowers, [])

  useEffect(() => { getAPOD().then(setApod).catch(() => {}) }, [])

  const now = new Date()
  const sunProgress = sunMoon.sunrise && sunMoon.sunset
    ? Math.max(0, Math.min(1, (now - sunMoon.sunrise) / (sunMoon.sunset - sunMoon.sunrise)))
    : 0.5
  const isDaytime = sunProgress > 0 && sunProgress < 1

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em]">Astronomy</h2>
        <button
          onClick={() => setShowSkyMap(true)}
          className="flex items-center gap-1.5 text-accent text-xs font-medium hover:bg-accent/10 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="7" cy="5" r="1" /><circle cx="18" cy="7" r="1" /><circle cx="5" cy="18" r="1" />
            <circle cx="19" cy="16" r="0.8" /><circle cx="14" cy="19" r="0.8" />
            <path d="M7 5l5 7M12 12l6-5M12 12l-7 6M12 12l7 4" strokeOpacity="0.3" strokeWidth="1" />
          </svg>
          Sky Map
        </button>
      </div>

      {showSkyMap && createPortal(
        <SkyMap lat={lat} lon={lon} onClose={() => setShowSkyMap(false)} />,
        document.body
      )}

      <div className="glass-card p-4 space-y-4">
        {/* Sun Arc */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-center">
              <div className="text-text-muted text-[10px]">Sunrise</div>
              <div className="text-text text-sm font-medium">{formatTime(sunMoon.sunrise)}</div>
            </div>
            <div className="text-center">
              {isDaytime && sunMoon.sunset ? (() => {
                const mins = Math.round((sunMoon.sunset - now) / 60000)
                const hrs = Math.floor(mins / 60)
                const m = mins % 60
                return mins > 0 ? (
                  <>
                    <div className="text-amber-400 text-[10px]">Sunset in</div>
                    <div className="text-amber-400 text-sm font-medium">{hrs}h {m}m</div>
                  </>
                ) : (
                  <>
                    <div className="text-text-muted text-[10px]">Solar Noon</div>
                    <div className="text-text text-sm font-medium">{formatTime(sunMoon.solarNoon)}</div>
                  </>
                )
              })() : !isDaytime && sunMoon.sunrise ? (() => {
                const tomorrow = new Date(sunMoon.sunrise)
                tomorrow.setDate(tomorrow.getDate() + 1)
                const target = now > sunMoon.sunrise ? tomorrow : sunMoon.sunrise
                const mins = Math.round((target - now) / 60000)
                const hrs = Math.floor(mins / 60)
                const m = mins % 60
                return mins > 0 && mins < 1440 ? (
                  <>
                    <div className="text-orange-300 text-[10px]">Sunrise in</div>
                    <div className="text-orange-300 text-sm font-medium">{hrs}h {m}m</div>
                  </>
                ) : (
                  <>
                    <div className="text-text-muted text-[10px]">Solar Noon</div>
                    <div className="text-text text-sm font-medium">{formatTime(sunMoon.solarNoon)}</div>
                  </>
                )
              })() : (
                <>
                  <div className="text-text-muted text-[10px]">Solar Noon</div>
                  <div className="text-text text-sm font-medium">{formatTime(sunMoon.solarNoon)}</div>
                </>
              )}
            </div>
            <div className="text-center">
              <div className="text-text-muted text-[10px]">Sunset</div>
              <div className="text-text text-sm font-medium">{formatTime(sunMoon.sunset)}</div>
            </div>
          </div>
          <div className="relative h-12 mx-4">
            <svg viewBox="0 0 200 50" className="w-full h-full">
              <path d="M10 45 Q100 -10 190 45" fill="none" stroke="#2a2a4a" strokeWidth="2" />
              {isDaytime && (
                <circle cx={10 + sunProgress * 180} cy={45 - Math.sin(sunProgress * Math.PI) * 50} r="6" fill="#ff9800" />
              )}
              <line x1="5" y1="45" x2="195" y2="45" stroke="#2a2a4a" strokeWidth="0.5" />
            </svg>
          </div>
          <div className="flex justify-between text-text-muted text-[10px] px-2">
            <span>Dawn {formatTime(sunMoon.dawn)}</span>
            {sunMoon.daylight && <span>{sunMoon.daylight.toFixed(1)}h daylight</span>}
            <span>Dusk {formatTime(sunMoon.dusk)}</span>
          </div>
        </div>

        {/* Moon */}
        <div className="flex items-center gap-4 pt-2 border-t border-border/30">
          <div className="text-4xl">{getMoonEmoji(sunMoon.moonPhase)}</div>
          <div className="flex-1">
            <div className="text-text font-medium text-sm">{getMoonPhaseName(sunMoon.moonPhase)}</div>
            <div className="text-text-muted text-xs">{Math.round(sunMoon.moonFraction * 100)}% illuminated</div>
            <div className="text-text-muted text-xs">
              {sunMoon.moonrise && `Rise ${formatTime(sunMoon.moonrise)}`}
              {sunMoon.moonrise && sunMoon.moonset && ' · '}
              {sunMoon.moonset && `Set ${formatTime(sunMoon.moonset)}`}
            </div>
          </div>
        </div>

        {/* Golden Hour */}
        {sunMoon.isGoldenHour && (
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-300 text-xs">
            Golden hour is happening now! Great for photography.
          </div>
        )}

        {/* Planet Visibility */}
        <div className="border-t border-border/30 pt-3">
          <button onClick={() => setShowPlanets(!showPlanets)} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{"\u{1FA90}"}</span>
              <div className="text-left">
                <div className="text-text text-sm font-medium">Planets Tonight</div>
                <div className="text-text-muted text-xs">
                  {visiblePlanets.length > 0
                    ? `${visiblePlanets.map(p => p.name).join(', ')} visible now`
                    : 'No planets currently above horizon'}
                </div>
              </div>
            </div>
            <svg viewBox="0 0 24 24" className={`w-4 h-4 text-text-muted transition-transform ${showPlanets ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {showPlanets && (
            <div className="mt-3 space-y-2">
              {planets.map(p => (
                <div key={p.name} className={`flex items-center gap-3 px-2 py-1.5 rounded-lg ${p.visible ? 'bg-surface-light/30' : 'opacity-40'}`}>
                  <span className="text-sm w-6 text-center">{p.symbol}</span>
                  <span className="text-text text-sm flex-1">{p.name}</span>
                  {p.visible ? (
                    <>
                      <span className="text-text-dim text-xs">{Math.round(p.altitude)}° alt</span>
                      <span className="text-text-muted text-xs w-8">{compassDir(p.azimuth)}</span>
                      <span className="text-green-400 text-[10px]">UP</span>
                    </>
                  ) : (
                    <span className="text-text-muted text-xs">Below horizon</span>
                  )}
                </div>
              ))}
              {visiblePlanets.length > 0 && (
                <p className="text-text-muted text-[10px] px-2 pt-1">
                  Look {compassDir(visiblePlanets[0].azimuth)} at ~{Math.round(visiblePlanets[0].altitude)}° above horizon
                </p>
              )}
            </div>
          )}
        </div>

        {/* Meteor Showers */}
        <div className="border-t border-border/30 pt-3">
          <button onClick={() => setShowShowers(!showShowers)} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{"\u2604\uFE0F"}</span>
              <div className="text-left">
                <div className="text-text text-sm font-medium">Meteor Showers</div>
                <div className="text-text-muted text-xs">
                  {showers[0].daysUntil === 0
                    ? `${showers[0].name} peaks tonight! Up to ${showers[0].rate}/hr`
                    : showers[0].daysUntil <= 7
                    ? `${showers[0].name} in ${showers[0].daysUntil} days`
                    : `Next: ${showers[0].name} in ${showers[0].daysUntil} days`}
                </div>
              </div>
            </div>
            <svg viewBox="0 0 24 24" className={`w-4 h-4 text-text-muted transition-transform ${showShowers ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {showShowers && (
            <div className="mt-3 space-y-2">
              {showers.map(s => (
                <div key={s.name} className="flex items-center gap-3 px-2 py-1.5">
                  <div className="flex-1">
                    <div className="text-text text-sm">{s.name}</div>
                    <div className="text-text-muted text-[10px]">Parent: {s.parent}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-accent text-xs font-medium">{s.rate}/hr</div>
                    <div className="text-text-muted text-[10px]">
                      {s.daysUntil === 0 ? 'Tonight!' : s.daysUntil === 1 ? 'Tomorrow' : `${s.daysUntil}d`}
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-text-muted text-[10px] px-2 pt-1">
                Best viewing: after midnight, dark skies away from city lights. Moon {Math.round(sunMoon.moonFraction * 100)}% lit
                {sunMoon.moonFraction > 0.5 ? ' (moonlight may reduce visibility)' : ' (good dark sky conditions)'}
              </p>
            </div>
          )}
        </div>

        {/* ISS */}
        <div className="border-t border-border/30 pt-2">
          <ISSSection lat={lat} lon={lon} />
        </div>

        {/* NASA APOD */}
        {apod && (
          <div className="border-t border-border/30 pt-3">
            <button onClick={() => setShowApod(!showApod)} className="text-left w-full">
              <div className="flex items-center gap-2">
                <span className="text-lg">{"\uD83C\uDF0C"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-text text-sm font-medium">NASA Picture of the Day</div>
                  <div className="text-text-muted text-xs truncate">{apod.title}</div>
                </div>
                <svg viewBox="0 0 24 24" className={`w-4 h-4 text-text-muted transition-transform ${showApod ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </button>
            {showApod && apod.mediaType === 'image' && (
              <div className="mt-3">
                <img src={apod.url} alt={apod.title} className="w-full rounded-lg" loading="lazy" />
                <p className="text-text-muted text-xs mt-2 leading-relaxed line-clamp-4">{apod.explanation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
