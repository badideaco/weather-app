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
    polygon: parseAlertPolygon(f.geometry),
  }))
}

function parseAlertPolygon(geometry) {
  if (!geometry?.coordinates) return []
  try {
    // GeoJSON coordinates are [lon, lat], Leaflet needs [lat, lon]
    const coords = geometry.type === 'Polygon' ? geometry.coordinates[0] :
                   geometry.type === 'MultiPolygon' ? geometry.coordinates[0][0] : []
    return coords.map(c => [c[1], c[0]])
  } catch { return [] }
}

// ── NOAA NEXRAD Radar (via Iowa State Mesonet) ──

export async function getRadarFrames() {
  const host = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0'

  // Get actual radar composite timestamp for accurate time labels
  let currentTime
  try {
    const meta = await fetchJSON('https://mesonet.agron.iastate.edu/json/tms.json')
    const n0q = meta.services?.find(s => s.id === 'ridge_uscomp_n0q')
    currentTime = n0q ? new Date(n0q.utc_valid) : new Date()
  } catch {
    currentTime = new Date()
  }

  // NEXRAD composite: 12 frames at 5-min intervals (55 minutes of history)
  const offsets = [55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0]
  const frames = offsets.map(offset => ({
    time: Math.floor((currentTime.getTime() - offset * 60000) / 1000),
    path: offset === 0 ? '/nexrad-n0q-900913' : `/nexrad-n0q-m${String(offset).padStart(2, '0')}m-900913`,
  }))

  return { host, frames }
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

// ── Flight Tracking (adsb.lol via Lambda proxy for CORS) ──

const FLIGHT_PROXY = 'https://ur5hdq5qngb7wdqeorhn7rz5yu0ahqwy.lambda-url.us-east-2.on.aws'

export async function getNearbyFlights(lat, lon) {
  const data = await fetchJSON(`${FLIGHT_PROXY}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&dist=100`)
  if (!data.ac) return []
  return data.ac
    .filter(a => a.lat != null && a.lon != null)
    .slice(0, 80)
    .map(a => ({
      icao24: a.hex,
      callsign: (a.flight || a.hex || '').trim(),
      type: a.t || '',
      desc: a.desc || '',
      registration: a.r || '',
      lon: a.lon,
      lat: a.lat,
      altitude: a.alt_baro !== 'ground' ? a.alt_baro : 0,
      velocity: a.gs != null ? Math.round(a.gs * 1.151) : null, // knots to mph
      heading: a.track,
      verticalRate: a.baro_rate || a.geom_rate || 0,
      onGround: a.alt_baro === 'ground',
      military: a.dbFlags === 1,
      category: a.category || '',
      squawk: a.squawk || '',
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

// ── Open-Meteo: Minutely Precipitation ──

export async function getMinutelyPrecip(lat, lon) {
  const data = await fetchJSON(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&minutely_15=precipitation,weathercode&forecast_minutely_15=96&timezone=auto`
  )
  if (!data.minutely_15) return []
  return data.minutely_15.time.map((t, i) => ({
    time: t,
    precip: data.minutely_15.precipitation[i] || 0,
    code: data.minutely_15.weathercode?.[i],
  }))
}

// ── Open-Meteo: Extended 16-day Forecast ──

export async function getExtendedForecast(lat, lon) {
  const data = await fetchJSON(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weathercode,windspeed_10m_max&temperature_unit=fahrenheit&precipitation_unit=inch&windspeed_unit=mph&forecast_days=16&timezone=auto`
  )
  if (!data.daily) return []
  return data.daily.time.map((t, i) => ({
    date: t,
    high: Math.round(data.daily.temperature_2m_max[i]),
    low: Math.round(data.daily.temperature_2m_min[i]),
    precipProb: data.daily.precipitation_probability_max[i],
    precipAmount: data.daily.precipitation_sum[i],
    code: data.daily.weathercode[i],
    windMax: Math.round(data.daily.windspeed_10m_max[i]),
  }))
}

// ── Open-Meteo: Yesterday's Weather (temp trend) ──

export async function getYesterdayWeather(lat, lon) {
  const y = new Date(); y.setDate(y.getDate() - 1)
  const yStr = y.toISOString().split('T')[0]
  const data = await fetchJSON(
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${yStr}&end_date=${yStr}&daily=temperature_2m_max,temperature_2m_min&hourly=surface_pressure&temperature_unit=fahrenheit&timezone=auto`
  )
  const pressures = (data.hourly?.surface_pressure || []).filter(p => p != null)
  return {
    high: data.daily?.temperature_2m_max?.[0] != null ? Math.round(data.daily.temperature_2m_max[0]) : null,
    low: data.daily?.temperature_2m_min?.[0] != null ? Math.round(data.daily.temperature_2m_min[0]) : null,
    avgPressure: pressures.length ? pressures.reduce((a, b) => a + b, 0) / pressures.length : null,
  }
}

// ── Open-Meteo: Pollen Forecast ──

export async function getPollenForecast(lat, lon) {
  const data = await fetchJSON(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=auto`
  )
  if (!data.current) return null
  const c = data.current
  return {
    grass: c.grass_pollen,
    ragweed: c.ragweed_pollen,
    birch: c.birch_pollen,
    alder: c.alder_pollen,
    mugwort: c.mugwort_pollen,
    olive: c.olive_pollen,
  }
}

// ── SPC Convective Outlook ──

export async function getSPCOutlook() {
  try {
    const data = await fetchJSON('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson')
    return data.features?.map(f => ({
      risk: f.properties?.LABEL || f.properties?.LABEL2 || 'Unknown',
      fill: f.properties?.fill || '#888',
      stroke: f.properties?.stroke || '#888',
      polygon: f.geometry?.coordinates?.[0]?.map(ring =>
        Array.isArray(ring[0]) ? ring.map(c => [c[1], c[0]]) : [[ring[1], ring[0]]]
      ).flat() || [],
    })).filter(f => f.polygon.length > 0) || []
  } catch { return [] }
}

// ── NOAA GOES Satellite Imagery ──

export async function getSatelliteFrames(sector = 'UMV', product = 'GEOCOLOR', count = 30) {
  const isConus = sector === 'CONUS'
  const basePath = isConus
    ? `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/${product}/`
    : `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/${sector}/${product}/`

  const resolution = isConus ? '1250x750' : '1200x1200'

  const res = await fetch(basePath)
  if (!res.ok) throw new Error(`${res.status}`)
  const html = await res.text()

  // Extract filenames matching target resolution (timestamp is YYYYDDDHHMM = 11 digits)
  const regex = new RegExp(`href="(\\d{11}_[^"]*?-${resolution}\\.jpg)"`, 'g')
  const filenames = []
  let m
  while ((m = regex.exec(html)) !== null) filenames.push(m[1])

  if (!filenames.length) return []

  return filenames.slice(-count).map(fn => {
    const ts = fn.match(/^(\d{4})(\d{3})(\d{2})(\d{2})/)
    if (!ts) return null
    const [, year, doy, hh, mm] = ts
    // Convert day-of-year to Date
    const date = new Date(Date.UTC(parseInt(year), 0, 1))
    date.setUTCDate(parseInt(doy))
    date.setUTCHours(parseInt(hh), parseInt(mm), 0, 0)
    return { url: `${basePath}${fn}`, time: Math.floor(date.getTime() / 1000) }
  }).filter(Boolean)
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
