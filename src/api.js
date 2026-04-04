const NWS_HEADERS = {
  'User-Agent': '(StormScope Weather, mike@badideaco.com)',
  Accept: 'application/geo+json',
}

async function fetchJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { ...headers } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// ── NWS Weather ──

export async function getNWSPoint(lat, lon) {
  const data = await fetchJSON(
    `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
    NWS_HEADERS
  )
  return {
    forecastUrl: data.properties.forecast,
    forecastHourlyUrl: data.properties.forecastHourly,
    stationsUrl: data.properties.observationStations,
    gridId: data.properties.gridId,
    gridX: data.properties.gridX,
    gridY: data.properties.gridY,
    city: data.properties.relativeLocation?.properties?.city,
    state: data.properties.relativeLocation?.properties?.state,
  }
}

export async function getForecast(url) {
  const data = await fetchJSON(url, NWS_HEADERS)
  return data.properties.periods
}

export async function getHourlyForecast(url) {
  const data = await fetchJSON(url, NWS_HEADERS)
  return data.properties.periods.slice(0, 48)
}

export async function getCurrentObservation(stationsUrl) {
  const stations = await fetchJSON(stationsUrl, NWS_HEADERS)
  const stationId = stations.features?.[0]?.properties?.stationIdentifier
  if (!stationId) throw new Error('No nearby station found')
  const obs = await fetchJSON(
    `https://api.weather.gov/stations/${stationId}/observations/latest`,
    NWS_HEADERS
  )
  const p = obs.properties
  return {
    temperature: celsiusToF(p.temperature?.value),
    dewpoint: celsiusToF(p.dewpoint?.value),
    humidity: round(p.relativeHumidity?.value),
    windSpeed: kphToMph(p.windSpeed?.value),
    windDirection: p.windDirection?.value,
    windGust: kphToMph(p.windGust?.value),
    pressure: pascalToInHg(p.barometricPressure?.value),
    visibility: metersToMiles(p.visibility?.value),
    heatIndex: celsiusToF(p.heatIndex?.value),
    windChill: celsiusToF(p.windChill?.value),
    description: p.textDescription,
    icon: p.icon,
    timestamp: p.timestamp,
  }
}

export async function getAlerts(lat, lon) {
  const data = await fetchJSON(
    `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
    NWS_HEADERS
  )
  return data.features.map(f => ({
    event: f.properties.event,
    severity: f.properties.severity,
    urgency: f.properties.urgency,
    headline: f.properties.headline,
    description: f.properties.description,
    instruction: f.properties.instruction,
    expires: f.properties.expires,
    senderName: f.properties.senderName,
  }))
}

// ── RainViewer Radar ──

export async function getRadarFrames() {
  const data = await fetchJSON('https://api.rainviewer.com/public/weather-maps.json')
  const past = (data.radar?.past || []).map(f => ({
    time: f.time,
    path: f.path,
  }))
  const nowcast = (data.radar?.nowcast || []).slice(0, 3).map(f => ({
    time: f.time,
    path: f.path,
    forecast: true,
  }))
  return { host: data.host || 'https://tilecache.rainviewer.com', frames: [...past, ...nowcast] }
}

// ── NOAA Space Weather ──

export async function getSpaceWeather() {
  const [kpData, scalesData, solarWind] = await Promise.all([
    fetchJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'),
    fetchJSON('https://services.swpc.noaa.gov/products/noaa-scales.json'),
    fetchJSON('https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json'),
  ])

  // Kp index - last entry (skip header row)
  const kpRows = kpData.slice(1)
  const latestKp = kpRows[kpRows.length - 1]
  const kpHistory = kpRows.slice(-24).map(r => ({
    time: r[0],
    kp: parseFloat(r[1]),
  }))

  // NOAA scales (current conditions)
  const scales = scalesData[0] || {}

  // Solar wind plasma - last entry (skip header)
  const windRows = solarWind.slice(1).filter(r => r[1] !== null && r[1] !== '-999.9')
  const latestWind = windRows[windRows.length - 1]
  const windHistory = windRows.slice(-72).map(r => ({
    time: r[0],
    density: parseFloat(r[1]),
    speed: parseFloat(r[2]),
    temperature: parseFloat(r[3]),
  }))

  return {
    kp: parseFloat(latestKp?.[1]) || 0,
    kpHistory,
    geoStorm: scales['G'] || { Scale: '0', Text: 'None' },
    solarRadiation: scales['S'] || { Scale: '0', Text: 'None' },
    radioBlackout: scales['R'] || { Scale: '0', Text: 'None' },
    solarWindSpeed: parseFloat(latestWind?.[2]) || 0,
    solarWindDensity: parseFloat(latestWind?.[1]) || 0,
    windHistory,
  }
}

// ── OpenSky Flight Tracking ──

export async function getNearbyFlights(lat, lon, radiusDeg = 1.5) {
  const url = `https://opensky-network.org/api/states/all?lamin=${lat - radiusDeg}&lomin=${lon - radiusDeg}&lamax=${lat + radiusDeg}&lomax=${lon + radiusDeg}`
  const data = await fetchJSON(url)
  if (!data.states) return []
  return data.states.slice(0, 80).map(s => ({
    icao24: s[0],
    callsign: (s[1] || '').trim(),
    country: s[2],
    lon: s[5],
    lat: s[6],
    altitude: s[7] != null ? Math.round(s[7] * 3.28084) : null, // meters to feet
    velocity: s[9] != null ? Math.round(s[9] * 2.237) : null, // m/s to mph
    heading: s[10],
    verticalRate: s[11] != null ? Math.round(s[11] * 196.85) : null, // m/s to ft/min
    onGround: s[8],
  }))
}

// ── NASA APOD ──

export async function getAPOD() {
  const data = await fetchJSON('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY')
  return {
    title: data.title,
    url: data.url,
    hdurl: data.hdurl,
    explanation: data.explanation,
    mediaType: data.media_type,
    date: data.date,
  }
}

// ── Unit conversions ──

function celsiusToF(c) {
  return c != null ? Math.round(c * 9 / 5 + 32) : null
}

function kphToMph(kph) {
  return kph != null ? Math.round(kph * 0.621371) : null
}

function pascalToInHg(pa) {
  return pa != null ? (pa * 0.00029530).toFixed(2) : null
}

function metersToMiles(m) {
  return m != null ? (m * 0.000621371).toFixed(1) : null
}

function round(v) {
  return v != null ? Math.round(v) : null
}

// ── Wind direction helper ──

export function degreesToCardinal(deg) {
  if (deg == null) return '--'
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}
