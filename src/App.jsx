import { useState, useEffect, useCallback } from 'react'
import { getNWSPoint, getForecast, getHourlyForecast, getCurrentObservation, getAlerts } from './api'
import CurrentWeather from './components/CurrentWeather'
import HourlyForecast from './components/HourlyForecast'
import DailyForecast from './components/DailyForecast'
import WeatherAlerts from './components/WeatherAlerts'
import RadarMap from './components/RadarMap'
import SpaceWeather from './components/SpaceWeather'
import Astronomy from './components/Astronomy'
import FlightTracker from './components/FlightTracker'

const STORAGE_KEY = 'stormscope-location'

function getSavedLocation() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  } catch { return null }
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

  const fetchWeather = useCallback(async (lat, lon) => {
    setLoading(true)
    setError(null)
    try {
      const point = await getNWSPoint(lat, lon)
      setLocationName(`${point.city}, ${point.state}`)

      const [forecast, hourlyData, obs, alertData] = await Promise.allSettled([
        getForecast(point.forecastUrl),
        getHourlyForecast(point.forecastHourlyUrl),
        getCurrentObservation(point.stationsUrl),
        getAlerts(lat, lon),
      ])

      if (forecast.status === 'fulfilled') setWeather(forecast.value)
      if (hourlyData.status === 'fulfilled') setHourly(hourlyData.value)
      if (obs.status === 'fulfilled') setObservation(obs.value)
      if (alertData.status === 'fulfilled') setAlerts(alertData.value)

      setLastUpdated(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
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
  }, [fetchWeather])

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
      fetchWeather(loc.lat, loc.lon)
    } catch (e) {
      setError('Could not find that ZIP code. Try again.')
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    if (location) fetchWeather(location.lat, location.lon)
  }

  const handleRelocate = () => {
    localStorage.removeItem(STORAGE_KEY)
    setLocation(null)
    requestLocation()
  }

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

  return (
    <div className="min-h-dvh bg-bg safe-top safe-bottom">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl border-b border-border/50 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-accent flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <button onClick={handleRelocate} className="text-text font-semibold truncate text-left">
              {locationName || 'Loading...'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-text-muted text-xs hidden sm:block">
                {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            <button onClick={handleRefresh} className="text-accent p-1.5 hover:bg-surface rounded-lg transition-colors" title="Refresh">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-2.2-5.9M21 3v5h-5"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 pb-8">
        {error && !weather && (
          <div className="mt-8 text-center">
            <p className="text-danger mb-4">{error}</p>
            <button onClick={handleRefresh} className="text-accent underline">Retry</button>
          </div>
        )}

        {alerts && alerts.length > 0 && <WeatherAlerts alerts={alerts} />}

        {(observation || currentPeriod) && (
          <CurrentWeather observation={observation} period={currentPeriod} forecast={weather} />
        )}

        {hourly && <HourlyForecast periods={hourly} />}

        {weather && <DailyForecast periods={weather} />}

        {location && <RadarMap lat={location.lat} lon={location.lon} />}

        <SpaceWeather />

        {location && <Astronomy lat={location.lat} lon={location.lon} />}

        {location && <FlightTracker lat={location.lat} lon={location.lon} />}

        <footer className="mt-8 pt-4 border-t border-border/30 text-center text-text-muted text-xs">
          <p>Data from NWS, NOAA SWPC, RainViewer, OpenSky Network, NASA</p>
          <p className="mt-1">StormScope Weather</p>
        </footer>
      </main>
    </div>
  )
}
