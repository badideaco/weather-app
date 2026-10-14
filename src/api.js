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

// Current conditions come from the station's recent report history (one
// request, ~6 KB gzipped), not /observations/latest: /latest lagged the newest
// report, and the 5-minute ASOS reports flip between "Mostly Clear" and
// "Thunderstorms" minute to minute (KMKC, Oct 2026). Nearest stations are
// tried in order; the first with a report under OBS_MAX_AGE_MIN wins.
const OBS_STATIONS_TRIED = 3
const OBS_MAX_AGE_MIN = 90
const OBS_WX_WINDOW_MIN = 15   // lookback for the most significant weather
const OBS_FIELD_WINDOW_MIN = 30 // lookback for a field the newest report lacks

function weatherRank(desc) {
  if (!desc) return -1
  if (/thunder|tornado|funnel|hail/i.test(desc)) return 2
  if (/rain|drizzle|shower|snow|sleet|freezing|ice pellets/i.test(desc)) return 1
  return 0
}

export async function getCurrentObservation(stationsUrl) {
  const stations = await fetchJSON(stationsUrl, NWS_HEADERS)
  const candidates = (stations.features || [])
    .slice(0, OBS_STATIONS_TRIED)
    .map(f => ({ id: f.properties?.stationIdentifier, name: f.properties?.name }))
    .filter(s => s.id)
  if (!candidates.length) throw new Error('No nearby station found')

  // 3.5 h of history also covers the 3-hour pressure tendency. Rounded down to
  // 10 min so the URL repeats and the SW / NWS CDN caches can reuse it.
  const startMs = Math.floor((Date.now() - 3.5 * 3600e3) / 600e3) * 600e3
  const start = new Date(startMs).toISOString().replace(/\.\d{3}Z$/, 'Z')
  let best = null
  for (const station of candidates) {
    let reports
    try {
      const data = await fetchJSON(
        `https://api.weather.gov/stations/${station.id}/observations?start=${start}`,
        NWS_HEADERS
      )
      reports = (data.features || []).map(f => f.properties).filter(p => p?.timestamp) // newest first
    } catch { continue }
    const latest = reports.find(p => p.temperature?.value != null)
    if (!latest) continue
    const ageMin = (Date.now() - new Date(latest.timestamp)) / 60000
    if (!best || ageMin < best.ageMin) best = { station, reports, latest, ageMin }
    if (ageMin <= OBS_MAX_AGE_MIN) break
  }
  if (!best) throw new Error('No recent observation')

  const { station, reports, latest } = best
  const latestMs = new Date(latest.timestamp).getTime()
  const within = (p, min) => latestMs - new Date(p.timestamp).getTime() <= min * 60000
  const field = (key) => reports.find(p => within(p, OBS_FIELD_WINDOW_MIN) && p[key]?.value != null)?.[key]?.value ?? null

  // Description: the most significant weather reported in the last 15 min
  const recent = reports.filter(p => within(p, OBS_WX_WINDOW_MIN) && p.textDescription)
  const topRank = Math.max(-1, ...recent.map(p => weatherRank(p.textDescription)))
  const description = recent.find(p => weatherRank(p.textDescription) === topRank)?.textDescription || null

  // Pressure tendency: same station, ~3 h apart (the standard tendency window)
  // Pressure from a report at most 30 min older than the newest (the shown value
  // must be current, not 3 h old)
  const pNow = reports.find(p => p.barometricPressure?.value != null && within(p, OBS_FIELD_WINDOW_MIN))
  let pressureChange3h = null
  if (pNow) {
    const target = new Date(pNow.timestamp).getTime() - 3 * 3600e3
    const then = reports
      .filter(p => p.barometricPressure?.value != null && Math.abs(new Date(p.timestamp) - target) <= 30 * 60000)
      .sort((a, b) => Math.abs(new Date(a.timestamp) - target) - Math.abs(new Date(b.timestamp) - target))[0]
    if (then) pressureChange3h = (pNow.barometricPressure.value - then.barometricPressure.value) * 0.00029530
  }

  return {
    temperature: celsiusToF(latest.temperature?.value),
    dewpoint: celsiusToF(field('dewpoint')),
    humidity: round(field('relativeHumidity')),
    windSpeed: kphToMph(field('windSpeed')),
    windDirection: field('windDirection'),
    windGust: kphToMph(latest.windGust?.value),
    pressure: pascalToInHg(pNow?.barometricPressure?.value),
    pressureChange3h,
    visibility: metersToMiles(field('visibility')),
    heatIndex: celsiusToF(latest.heatIndex?.value),
    windChill: celsiusToF(latest.windChill?.value),
    description,
    icon: latest.icon,
    timestamp: latest.timestamp,
    stationId: station.id,
    stationName: station.name,
  }
}

export async function getAlerts(lat, lon) {
  const data = await fetchJSON(
    `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
    NWS_HEADERS
  )
  return data.features.map(f => ({
    id: f.properties.id || f.id,
    event: f.properties.event,
    severity: f.properties.severity,
    urgency: f.properties.urgency,
    headline: f.properties.headline,
    description: f.properties.description,
    instruction: f.properties.instruction,
    expires: f.properties.expires,
    senderName: f.properties.senderName,
    polygon: toLeafletPolygons(f.geometry),
  }))
}

// GeoJSON Polygon/MultiPolygon ([lon, lat]) → Leaflet multi-polygon: an array
// of polygons, each an array of rings of [lat, lon]. Keeps every part and hole
// (the old parser kept only the first part, dropping e.g. 2 of SPC's 3
// thunderstorm areas). L.polygon accepts this nesting directly.
function toLeafletPolygons(geometry) {
  if (!geometry?.coordinates) return []
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
  return polys.map(rings => rings.map(ring => ring.map(c => [c[1], c[0]])))
}

function inRing(lat, lon, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Is the point inside a toLeafletPolygons() shape (outer ring, not in a hole)?
export function pointInPolygons(lat, lon, polygons) {
  return (polygons || []).some(rings =>
    rings.length > 0 && inRing(lat, lon, rings[0]) && !rings.slice(1).some(h => inRing(lat, lon, h)))
}

// ── Storm-based warnings near the user (for the radar) ──
// NWS alerts?point= only returns warnings that cover the user's exact spot.
// IEM's feed has every active storm-based warning polygon in the US in ~20 KB.
const WARNING_TYPES = {
  TO: 'Tornado Warning',
  SV: 'Severe Thunderstorm Warning',
  EW: 'Extreme Wind Warning',
  FF: 'Flash Flood Warning',
  SQ: 'Snow Squall Warning',
}

export async function getStormWarnings() {
  const data = await fetchJSON('https://mesonet.agron.iastate.edu/geojson/sbw.geojson')
  return (data.features || [])
    .filter(f => f.properties?.significance === 'W' && WARNING_TYPES[f.properties.phenomena])
    .map(f => {
      const p = f.properties
      return {
        id: `${p.wfo}-${p.phenomena}-${p.eventid}-${p.year}`,
        type: p.phenomena,
        name: WARNING_TYPES[p.phenomena],
        expires: p.expire || p.polygon_end,
        polygon: toLeafletPolygons(f.geometry),
      }
    })
    .filter(w => w.polygon.length)
}

// ── NOAA NEXRAD Radar (via Iowa State Mesonet) ──
// Uses timestamped archive layers (ridge::USCOMP-N0Q-YYYYMMDDHHMM) instead of
// the relative-time layers (nexrad-n0q-mXXm). Relative layers re-point to newer
// scans as wall-clock time advances, so cached tiles mix ages within a frame
// and time labels drift. Timestamped URLs are immutable: cache-safe, and the
// label always matches the imagery.

const RADAR_FRAME_COUNT = 12
const RADAR_STEP_MIN = 5

function radarTimestamp(date) {
  const p = n => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}`
}

export async function getRadarFrames() {
  const host = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0'

  // Latest composite valid time from IEM metadata (5-min grid)
  let latest = null
  try {
    const meta = await fetchJSON('https://mesonet.agron.iastate.edu/json/tms.json')
    const n0q = meta.services?.find(s => s.id === 'ridge_uscomp_n0q')
    if (n0q) latest = new Date(n0q.utc_valid)
  } catch { /* fall through to wall-clock estimate */ }
  if (!latest || isNaN(latest.getTime())) {
    // Composite generation lags a few minutes; snap down to the 5-min grid
    // and back off one step so the newest frame actually exists
    latest = new Date()
    latest.setUTCSeconds(0, 0)
    latest.setUTCMinutes(Math.floor(latest.getUTCMinutes() / RADAR_STEP_MIN) * RADAR_STEP_MIN - RADAR_STEP_MIN)
  }

  const frames = []
  for (let i = RADAR_FRAME_COUNT - 1; i >= 0; i--) {
    const t = new Date(latest.getTime() - i * RADAR_STEP_MIN * 60000)
    frames.push({
      time: Math.floor(t.getTime() / 1000),
      path: `/ridge::USCOMP-N0Q-${radarTimestamp(t)}`,
    })
  }

  return { host, frames }
}

// ── NOAA Space Weather ──

// Feeds load independently: one dead feed must not blank the section (in Oct
// 2026 products/solar-wind/plasma-7-day.json went 404 and, inside a
// Promise.all, took Kp and the NOAA scales down with it).
export async function getSpaceWeather() {
  const swpc = 'https://services.swpc.noaa.gov'
  const [kpRes, scalesRes, speedRes, magRes] = await Promise.allSettled([
    fetchJSON(`${swpc}/products/noaa-planetary-k-index.json`),
    fetchJSON(`${swpc}/products/noaa-scales.json`),
    fetchJSON(`${swpc}/products/summary/solar-wind-speed.json`),
    fetchJSON(`${swpc}/products/summary/solar-wind-mag-field.json`),
  ])
  const ok = r => (r.status === 'fulfilled' ? r.value : null)
  const first = v => (Array.isArray(v) ? v[0] : v)
  const num = v => (v != null && Number.isFinite(Number(v)) ? Number(v) : null)

  // Kp: SWPC moved this product from header + row arrays to objects
  // ({time_tag, Kp}) in 2026. Accept both; the header row parses to NaN.
  const kpRaw = ok(kpRes)
  const kpRows = (Array.isArray(kpRaw) ? kpRaw : [])
    .map(r => (Array.isArray(r) ? { time: r[0], kp: num(r[1]) } : { time: r?.time_tag, kp: num(r?.Kp ?? r?.kp) }))
    .filter(r => r.time && r.kp != null)

  const scales = ok(scalesRes)?.[0] || null
  const speed = first(ok(speedRes))
  const mag = first(ok(magRes))

  if (!kpRows.length && !scales && !speed && !mag) throw new Error('Space weather feeds unavailable')

  return {
    kp: kpRows.length ? kpRows[kpRows.length - 1].kp : null,
    kpHistory: kpRows.slice(-24),
    geoStorm: scales?.G || null,
    solarRadiation: scales?.S || null,
    radioBlackout: scales?.R || null,
    solarWindSpeed: num(speed?.proton_speed),
    bz: num(mag?.bz_gsm), // southward (negative) Bz is what drives aurora
    bt: num(mag?.bt),
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

// NASA's shared DEMO_KEY allows ~30 requests/hour and 50/day per IP, and a
// household (or a carrier NAT) shares one IP. So: cache in localStorage by
// date (APOD changes once a day), retry at most hourly after a failure (the
// backoff survives app restarts), and never retry straight into a 429.
// Undated requests returned 500 in Oct 2026 while dated ones worked, so ask
// for today's date (APOD runs on US Eastern time) and fall back one day.
const APOD_CACHE_KEY = 'stormscope-apod'
const APOD_RETRY_MS = 60 * 60 * 1000

function readApodCache() {
  try { return JSON.parse(localStorage.getItem(APOD_CACHE_KEY) || '{}') } catch { return {} }
}
function writeApodCache(v) {
  try { localStorage.setItem(APOD_CACHE_KEY, JSON.stringify(v)) } catch { /* storage full or blocked */ }
}

export async function getAPOD() {
  const day = offset => new Date(Date.now() - offset * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const today = day(0)
  const cache = readApodCache()
  const recent = t => t && Date.now() - t < APOD_RETRY_MS
  if (cache.data && (cache.data.date === today || recent(cache.fetchedAt))) return cache.data
  if (recent(cache.failedAt)) {
    if (cache.data) return cache.data
    throw new Error('APOD: waiting before retrying')
  }

  const url = d => `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&date=${d}`
  try {
    let data
    try {
      data = await fetchJSON(url(today))
    } catch (e) {
      if (String(e.message).startsWith('429')) throw e // rate limited: don't spend another
      data = await fetchJSON(url(day(1))) // today's not posted yet
    }
    const apod = {
      title: data.title,
      url: data.url,
      hdurl: data.hdurl,
      explanation: data.explanation,
      mediaType: data.media_type,
      date: data.date,
    }
    writeApodCache({ data: apod, fetchedAt: Date.now() })
    return apod
  } catch (e) {
    writeApodCache({ ...cache, failedAt: Date.now() })
    if (cache.data) return cache.data // last known picture beats an error
    throw e
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

// ── Open-Meteo: Current UV index ──

export async function getCurrentUV(lat, lon) {
  const data = await fetchJSON(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=uv_index&timezone=auto`
  )
  const uv = data.current?.uv_index
  return uv != null ? Math.round(uv) : null
}

// ── Open-Meteo: Yesterday's Weather (temp trend) ──
// (Pressure trend now comes from the station's own 3-hour history.)

export async function getYesterdayWeather(lat, lon) {
  const y = new Date(); y.setDate(y.getDate() - 1)
  const yStr = y.toISOString().split('T')[0]
  const data = await fetchJSON(
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${yStr}&end_date=${yStr}&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto`
  )
  return {
    high: data.daily?.temperature_2m_max?.[0] != null ? Math.round(data.daily.temperature_2m_max[0]) : null,
    low: data.daily?.temperature_2m_min?.[0] != null ? Math.round(data.daily.temperature_2m_min[0]) : null,
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

// Throws on failure so the section can say so; [] means no risk areas today.
export async function getSPCOutlook() {
  const data = await fetchJSON('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson')
  return (data.features || []).map(f => ({
    risk: f.properties?.LABEL || f.properties?.LABEL2 || 'Unknown',
    fill: f.properties?.fill || '#888',
    stroke: f.properties?.stroke || '#888',
    polygon: toLeafletPolygons(f.geometry),
  })).filter(f => f.polygon.length > 0)
}

// ── NOAA GOES Satellite Imagery ──

export async function getSatelliteFrames(sector = 'UMV', product = 'GEOCOLOR', count = 30) {
  // Determine satellite, URL path, and resolution based on sector type
  let sat = 'GOES19', basePath, resolution

  if (sector === 'FD-WEST') {
    sat = 'GOES18'
    basePath = `https://cdn.star.nesdis.noaa.gov/${sat}/ABI/FD/${product}/`
    resolution = '678x678'
  } else if (sector === 'FD') {
    basePath = `https://cdn.star.nesdis.noaa.gov/${sat}/ABI/FD/${product}/`
    resolution = '678x678'
  } else if (sector === 'CONUS') {
    basePath = `https://cdn.star.nesdis.noaa.gov/${sat}/ABI/CONUS/${product}/`
    resolution = '1250x750'
  } else {
    basePath = `https://cdn.star.nesdis.noaa.gov/${sat}/ABI/SECTOR/${sector}/${product}/`
    resolution = '1200x1200'
  }

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

// ── NASA EPIC (DSCOVR at L1 — whole sunlit Earth) ──

export async function getEPICImages(type = 'enhanced') {
  const data = await fetchJSON(`https://epic.gsfc.nasa.gov/api/${type}`)
  if (!data?.length) return []
  return data.map(img => {
    const [date] = img.date.split(' ')
    const [year, month, day] = date.split('-')
    return {
      url: `https://epic.gsfc.nasa.gov/archive/${type}/${year}/${month}/${day}/jpg/${img.image}.jpg`,
      time: Math.floor(new Date(img.date.replace(' ', 'T') + 'Z').getTime() / 1000),
      caption: img.caption,
      lat: img.centroid_coordinates?.lat,
      lon: img.centroid_coordinates?.lon,
    }
  })
}

// ── NOAA Aurora Forecast ──

export async function getAuroraFrames(hemisphere = 'north') {
  const data = await fetchJSON(
    `https://services.swpc.noaa.gov/products/animations/ovation_${hemisphere}_24h.json`
  )
  if (!Array.isArray(data)) return []
  return data.map(f => ({
    url: f.url?.startsWith('http') ? f.url : `https://services.swpc.noaa.gov${f.url}`,
    time: f.time_tag ? Math.floor(new Date(f.time_tag).getTime() / 1000) : 0,
  })).filter(f => f.url && f.time)
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
