import { useState, useEffect, useCallback, useRef, createContext } from 'react'
import { getNWSPoint, getForecast, getHourlyForecast, getCurrentObservation, getAlerts, getYesterdayWeather, getCurrentUV } from './api'
import { formatTime } from './timezone'
import { usePushNotifications } from './hooks/usePushNotifications'
import CurrentWeather from './components/CurrentWeather'
import HourlyForecast from './components/HourlyForecast'
import DailyForecast from './components/DailyForecast'
import WeatherAlerts from './components/WeatherAlerts'
import RadarMap from './components/RadarMap'
import SpaceWeather from './components/SpaceWeather'
import Astronomy from './components/Astronomy'
import FlightTracker from './components/FlightTracker'
import WeatherAmbient from './components/WeatherAmbient'
import WindRose from './components/WindRose'
import UVTimer from './components/UVTimer'
import ClothingRec from './components/ClothingRec'
import WeatherBriefing from './components/WeatherBriefing'
import LocationManager from './components/LocationManager'
import AirQuality from './components/AirQuality'
import WeatherHistory from './components/WeatherHistory'
import MinutelyPrecip from './components/MinutelyPrecip'
import ForecastCharts from './components/ForecastCharts'
import SPCOutlook from './components/SPCOutlook'
import ExtendedForecast from './components/ExtendedForecast'
import SatelliteMap from './components/SatelliteMap'
import EarthView from './components/EarthView'
import AuroraForecast from './components/AuroraForecast'
import PollenForecast from './components/PollenForecast'

const STORAGE_KEY = 'stormscope-location'
const ALERT_POLL_MS = 5 * 60 * 1000   // Check alerts every 5 min
const REFRESH_MS = 10 * 60 * 1000     // Full refresh every 10 min
const RESUME_STALE_MS = 5 * 60 * 1000 // Refresh on reopen if data is older than this

function getSavedLocation() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

function RevealSection({ children, className = '' }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`${visible ? 'reveal-visible' : 'reveal-hidden'} ${className}`}>
      {children}
    </div>
  )
}

export default function App() {
  const [location, setLocation] = useState(getSavedLocation)
  const [locationName, setLocationName] = useState('')
  const [weather, setWeather] = useState(null)
  const [hourly, setHourly] = useState(null)
  const [observation, setObservation] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [manualEntry, setManualEntry] = useState(false)
  const [zipInput, setZipInput] = useState('')
  const [yesterday, setYesterday] = useState(null)
  const [uvIndex, setUvIndex] = useState(null)
  // Bumped after every refresh attempt. Sections that load their own data
  // (radar, outlooks, air quality, space weather, briefing...) refetch on it;
  // most of them used to load once per session.
  const [refreshKey, setRefreshKey] = useState(0)
  const alertPollRef = useRef(null)
  const refreshRef = useRef(null)
  const lastFetchRef = useRef(0)
  const inFlightRef = useRef(null) // "lat,lon" of the refresh in progress
  const requestSeqRef = useRef(0)  // only the newest refresh may apply its results
  // OS-level alert notifications are delivered via Web Push from the
  // weather-push Lambda (works with the PWA closed) — not from this page.
  const push = usePushNotifications()

  const fetchWeather = useCallback(async (lat, lon) => {
    // When iOS unfreezes the PWA, the overdue 10-min timer and the reopen
    // handler can fire together: one refresh per location at a time
    const key = `${lat},${lon}`
    if (inFlightRef.current === key) return
    inFlightRef.current = key
    const seq = ++requestSeqRef.current
    const isLatest = () => seq === requestSeqRef.current // a location switch mid-refresh supersedes it
    setLoading(true)
    lastFetchRef.current = Date.now()
    try {
      const point = await getNWSPoint(lat, lon)
      if (!isLatest()) return
      // Non-blocking extras
      getYesterdayWeather(lat, lon).then(v => { if (isLatest()) setYesterday(v) }).catch(() => {})
      getCurrentUV(lat, lon).then(v => { if (isLatest()) setUvIndex(v) }).catch(() => { if (isLatest()) setUvIndex(null) })
      setLocationName(`${point.city}, ${point.state}`)

      const [forecast, hourlyData, obs, alertData] = await Promise.allSettled([
        getForecast(point.forecastUrl),
        getHourlyForecast(point.forecastHourlyUrl),
        getCurrentObservation(point.stationsUrl),
        getAlerts(lat, lon),
      ])
      if (!isLatest()) return

      if (forecast.status === 'fulfilled') setWeather(forecast.value)
      if (hourlyData.status === 'fulfilled') setHourly(hourlyData.value)
      if (obs.status === 'fulfilled') setObservation(obs.value)
      if (alertData.status === 'fulfilled') setAlerts(alertData.value)

      // Only claim fresh data if the core data actually refreshed
      if (forecast.status === 'fulfilled' || obs.status === 'fulfilled') {
        setLastUpdated(new Date())
        setError(null)
      } else {
        setError('Could not reach the National Weather Service')
      }
    } catch (e) {
      if (isLatest()) setError(e.message || 'Could not reach the National Weather Service')
    } finally {
      if (inFlightRef.current === key) inFlightRef.current = null
      if (isLatest()) {
        setLoading(false)
        setRefreshKey(k => k + 1)
      }
    }
  }, [])

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setManualEntry(true)
      setLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        setLocation(loc)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(loc))
        if (push.subscribed) push.updateLocation(loc.lat, loc.lon)
        fetchWeather(loc.lat, loc.lon)
      },
      () => {
        const saved = getSavedLocation()
        if (saved) {
          fetchWeather(saved.lat, saved.lon)
        } else {
          setManualEntry(true)
          setLoading(false)
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  }, [fetchWeather, push])

  useEffect(() => {
    if (location) {
      fetchWeather(location.lat, location.lon)
    } else {
      requestLocation()
    }
  }, []) // eslint-disable-line

  const handleZipLookup = async () => {
    if (!zipInput.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zipInput.trim()}`)
      if (!res.ok) throw new Error('Invalid ZIP code')
      const data = await res.json()
      const place = data.places[0]
      const loc = { lat: parseFloat(place.latitude), lon: parseFloat(place.longitude) }
      setLocation(loc)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loc))
      setManualEntry(false)
      if (push.subscribed) push.updateLocation(loc.lat, loc.lon)
      fetchWeather(loc.lat, loc.lon)
    } catch (e) {
      setError('Could not find that ZIP code. Try again.')
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    if (!location) return
    // Clear all personality-specific briefing caches
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('stormscope-briefing')) localStorage.removeItem(key)
    }
    fetchWeather(location.lat, location.lon)
  }

  const handleRelocate = () => {
    localStorage.removeItem(STORAGE_KEY)
    setLocation(null)
    requestLocation()
  }

  const handleSelectLocation = (loc) => {
    setLocation(loc)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat: loc.lat, lon: loc.lon }))
    // Push alerts follow the location being viewed
    if (push.subscribed) push.updateLocation(loc.lat, loc.lon)
    // Clear all personality-specific briefing caches for new location
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('stormscope-briefing')) localStorage.removeItem(key)
    }
    fetchWeather(loc.lat, loc.lon)
  }

  // Toggle push notifications (subscribe must run inside the tap — iOS requirement)
  const toggleNotifications = async () => {
    if (push.subscribed) {
      await push.unsubscribe()
    } else if (location) {
      await push.subscribe(location.lat, location.lon)
    }
  }

  // Background alert polling (every 5 min) + full refresh (every 10 min)
  // Keeps the in-app alert banner current; OS notifications come via push.
  useEffect(() => {
    if (!location) return
    alertPollRef.current = setInterval(async () => {
      if (document.hidden) return
      try {
        setAlerts(await getAlerts(location.lat, location.lon))
      } catch {}
    }, ALERT_POLL_MS)
    // Full weather refresh every 10 min
    refreshRef.current = setInterval(() => {
      if (document.hidden) return
      if (Date.now() - lastFetchRef.current < REFRESH_MS - 30000) return // a reopen refresh just ran
      fetchWeather(location.lat, location.lon)
    }, REFRESH_MS)
    return () => {
      clearInterval(alertPollRef.current)
      clearInterval(refreshRef.current)
    }
  }, [location, fetchWeather])

  // Reopening the app (home-screen PWA brought back from the background, or a
  // restored tab) refreshes everything if the data is stale. iOS suspends
  // timers in the background, so without this a PWA opened hours later showed
  // hours-old conditions, radar and alerts until the next 10-min tick.
  useEffect(() => {
    if (!location) return
    const maybeRefresh = () => {
      if (document.hidden) return
      if (Date.now() - lastFetchRef.current > RESUME_STALE_MS) fetchWeather(location.lat, location.lon)
    }
    const onPageShow = (e) => { if (e.persisted) maybeRefresh() }
    document.addEventListener('visibilitychange', maybeRefresh)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [location, fetchWeather])

  // Manual ZIP entry screen
  if (manualEntry && !location) {
    return (
      <div className="min-h-dvh bg-bg flex items-center justify-center p-6">
        <div className="text-center max-w-sm w-full">
          <div className="text-6xl mb-4">&#9729;</div>
          <h1 className="text-2xl font-bold text-text mb-2">StormScope</h1>
          <p className="text-text-dim mb-6">Enter your ZIP code to get started</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={zipInput}
              onChange={e => setZipInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleZipLookup()}
              placeholder="ZIP Code"
              className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-text text-center text-lg outline-none focus:border-accent"
            />
            <button
              onClick={handleZipLookup}
              className="bg-accent text-bg font-semibold px-6 py-3 rounded-xl"
            >Go</button>
          </div>
          {error && <p className="text-danger mt-3 text-sm">{error}</p>}
          <button
            onClick={requestLocation}
            className="mt-4 text-accent text-sm underline"
          >Use my location instead</button>
        </div>
      </div>
    )
  }

  // Loading screen
  if (loading && !weather && !observation) {
    return (
      <div className="min-h-dvh bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-text-dim">Loading weather data...</p>
        </div>
      </div>
    )
  }

  const currentPeriod = weather?.[0]

  const ambientDesc = observation?.description || currentPeriod?.shortForecast
  const ambientDaytime = currentPeriod?.isDaytime

  return (
    <div className="min-h-dvh bg-bg safe-top safe-bottom relative">
      {/* Ambient weather animation */}
      {ambientDesc && <WeatherAmbient description={ambientDesc} isDaytime={ambientDaytime} />}

      {/* Atmospheric overlay */}
      <div className="atmo-overlay" />

      {/* Header */}
      <header className="sticky top-0 z-50 premium-header px-4 py-3 relative">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <LocationManager
            currentLocation={location}
            locationName={locationName}
            onSelect={handleSelectLocation}
            onRelocate={handleRelocate}
          />
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span
                className={`text-[11px] sm:text-xs tabular-nums ${error ? 'text-amber-400' : 'text-text-muted'}`}
                title={error ? `Refresh failed: ${error}` : 'Last updated'}
              >
                {formatTime(lastUpdated)}
              </span>
            )}
            {push.supported && (
              <button
                onClick={toggleNotifications}
                disabled={push.loading}
                className={`p-1.5 rounded-lg transition-colors ${push.subscribed ? 'text-accent bg-accent/10' : 'text-text-muted hover:bg-surface'} ${push.loading ? 'opacity-50' : ''}`}
                title={push.subscribed ? 'Alert notifications on' : 'Enable alert notifications'}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
                  {push.subscribed && <circle cx="18" cy="5" r="3" fill="#4fc3f7" stroke="none"/>}
                </svg>
              </button>
            )}
            <button onClick={handleRefresh} className="text-accent p-1.5 hover:bg-surface rounded-lg transition-colors" title="Refresh">
              <svg viewBox="0 0 24 24" className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-2.2-5.9M21 3v5h-5"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 pb-8 relative z-10">
        {error && !weather && (
          <div className="mt-8 text-center">
            <p className="text-danger mb-4">{error}</p>
            <button onClick={handleRefresh} className="text-accent underline">Retry</button>
          </div>
        )}

        {/* A failed refresh keeps the last data on screen, but says so */}
        {error && weather && !loading && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-900/20 px-4 py-2.5 flex items-center justify-between gap-3">
            <p className="text-amber-300 text-xs">
              Couldn&apos;t refresh{lastUpdated ? `. Showing data from ${formatTime(lastUpdated)}` : ''}.
            </p>
            {/* Retry the data only: handleRefresh also clears the AI briefing cache */}
            <button onClick={() => location && fetchWeather(location.lat, location.lon)} className="text-accent text-xs underline flex-shrink-0">Retry</button>
          </div>
        )}

        {alerts && alerts.length > 0 && <WeatherAlerts alerts={alerts} />}

        <WeatherBriefing observation={observation} forecast={weather} hourly={hourly} alerts={alerts} locationName={locationName} refreshKey={refreshKey} />

        {(observation || currentPeriod) && (
          <CurrentWeather observation={observation} period={currentPeriod} forecast={weather} yesterday={yesterday} />
        )}

        {location && <RadarMap lat={location.lat} lon={location.lon} alerts={alerts} refreshKey={refreshKey} />}

        {location && (
          <RevealSection>
            <MinutelyPrecip lat={location.lat} lon={location.lon} refreshKey={refreshKey} />
          </RevealSection>
        )}

        {/* Wind + UV + Clothing row */}
        {observation && (
          <RevealSection>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <WindRose direction={observation.windDirection} speed={observation.windSpeed} gust={observation.windGust} />
              <div className="space-y-4">
                <UVTimer uvIndex={uvIndex} />
                <ClothingRec
                  temp={observation.temperature}
                  wind={observation.windSpeed}
                  humidity={observation.humidity}
                  conditions={observation.description}
                  uvIndex={uvIndex}
                />
              </div>
            </div>
          </RevealSection>
        )}

        {hourly && <RevealSection><HourlyForecast periods={hourly} /></RevealSection>}

        {weather && <RevealSection><DailyForecast periods={weather} /></RevealSection>}

        {location && <RevealSection><ExtendedForecast lat={location.lat} lon={location.lon} refreshKey={refreshKey} /></RevealSection>}

        {hourly && <RevealSection><ForecastCharts hourly={hourly} /></RevealSection>}

        {location && <RevealSection><SatelliteMap lat={location.lat} lon={location.lon} /></RevealSection>}

        <RevealSection><EarthView /></RevealSection>

        {location && <RevealSection><SPCOutlook lat={location.lat} lon={location.lon} refreshKey={refreshKey} /></RevealSection>}

        {location && <RevealSection><AirQuality lat={location.lat} lon={location.lon} refreshKey={refreshKey} /></RevealSection>}

        {location && <RevealSection><PollenForecast lat={location.lat} lon={location.lon} refreshKey={refreshKey} /></RevealSection>}

        <RevealSection><SpaceWeather refreshKey={refreshKey} /></RevealSection>

        <RevealSection><AuroraForecast /></RevealSection>

        {location && <RevealSection><Astronomy lat={location.lat} lon={location.lon} refreshKey={refreshKey} /></RevealSection>}

        {location && <RevealSection><WeatherHistory lat={location.lat} lon={location.lon} /></RevealSection>}

        {location && <RevealSection><FlightTracker lat={location.lat} lon={location.lon} /></RevealSection>}

        <footer className="mt-8 pt-4 border-t border-white/[0.04] text-center text-text-muted text-xs">
          <p>Data from NWS, NOAA (SPC, SWPC, GOES), Iowa State Mesonet, Open-Meteo, Blitzortung, EUMETSAT, NASA, adsb.lol</p>
          <p className="mt-1">Map tiles &copy; Esri, HERE, Garmin, OpenStreetMap</p>
          <p className="mt-1 text-text-muted/60">StormScope Weather</p>
        </footer>
      </main>
    </div>
  )
}
