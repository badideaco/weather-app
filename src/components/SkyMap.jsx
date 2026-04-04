import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import * as AstroEngine from 'astronomy-engine'
import SunCalc from 'suncalc'
import { STARS, CONSTELLATIONS, MILKY_WAY_BAND, DEEP_SKY_OBJECTS, METEOR_RADIANTS, bvToColor } from '../data/starCatalog'
import { formatTime as fmtTime, formatDate as fmtDate, TZ } from '../timezone'

// ── Constants ──

const DEG = Math.PI / 180
const RAD = 180 / Math.PI
const TWO_PI = Math.PI * 2
const OBLIQUITY = 23.44 * DEG

const PLANETS = [
  { name: 'Mercury', body: AstroEngine.Body.Mercury, color: '#b8b8b8', size: 3 },
  { name: 'Venus', body: AstroEngine.Body.Venus, color: '#fffde0', size: 5 },
  { name: 'Mars', body: AstroEngine.Body.Mars, color: '#e87040', size: 4 },
  { name: 'Jupiter', body: AstroEngine.Body.Jupiter, color: '#f0d8a0', size: 5 },
  { name: 'Saturn', body: AstroEngine.Body.Saturn, color: '#f0e0a0', size: 4 },
  { name: 'Uranus', body: AstroEngine.Body.Uranus, color: '#a0e8e8', size: 3 },
  { name: 'Neptune', body: AstroEngine.Body.Neptune, color: '#7090f0', size: 3 },
]

const CARDINALS = [
  { az: 0, label: 'N' }, { az: 45, label: 'NE' }, { az: 90, label: 'E' },
  { az: 135, label: 'SE' }, { az: 180, label: 'S' }, { az: 225, label: 'SW' },
  { az: 270, label: 'W' }, { az: 315, label: 'NW' },
]

const DSO_COLORS = {
  Galaxy: [180, 170, 120],
  Nebula: [100, 180, 170],
  Cluster: [170, 180, 210],
  Remnant: [130, 180, 130],
}

const MAG_LEVELS = [4.0, 2.5, 1.5]

// ── Coordinate Helpers ──

function raDecToAltAz(ra, dec, lst, lat) {
  const ha = (lst - ra) * 15 * DEG
  const decR = dec * DEG
  const latR = lat * DEG
  const sinAlt = Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(ha)
  const alt = Math.asin(sinAlt) * RAD
  const cosA = (Math.sin(decR) - Math.sin(alt * DEG) * Math.sin(latR)) / (Math.cos(alt * DEG) * Math.cos(latR))
  let az = Math.acos(Math.max(-1, Math.min(1, cosA))) * RAD
  if (Math.sin(ha) > 0) az = 360 - az
  return { alt, az }
}

function project(alt, az, lookAlt, lookAz, fov, w, h) {
  const a1 = alt * DEG, a2 = lookAlt * DEG
  const daz = (az - lookAz) * DEG
  const cosDist = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(daz)
  if (cosDist < -0.2) return null
  const dist = Math.acos(Math.max(-1, Math.min(1, cosDist)))
  if (dist * RAD > fov * 0.7) return null
  const sinB = Math.cos(a1) * Math.sin(daz)
  const cosB = Math.sin(a1) * Math.cos(a2) - Math.cos(a1) * Math.sin(a2) * Math.cos(daz)
  const bearing = Math.atan2(sinB, cosB)
  const r = 2 * Math.tan(dist / 2)
  const scale = Math.min(w, h) / (2 * Math.tan((fov * DEG) / 2))
  return { x: w / 2 + r * Math.sin(bearing) * scale, y: h / 2 - r * Math.cos(bearing) * scale }
}

function magToSize(mag) {
  return Math.max(0.8, 4.5 - mag * 0.9)
}

// ── ISS topocentric position ──

function issToAltAz(issLat, issLon, issAltKm, obsLat, obsLon) {
  const R = 6371
  const issR = R + issAltKm
  const iLat = issLat * DEG, iLon = issLon * DEG
  const oLat = obsLat * DEG, oLon = obsLon * DEG
  const ix = issR * Math.cos(iLat) * Math.cos(iLon)
  const iy = issR * Math.cos(iLat) * Math.sin(iLon)
  const iz = issR * Math.sin(iLat)
  const ox = R * Math.cos(oLat) * Math.cos(oLon)
  const oy = R * Math.cos(oLat) * Math.sin(oLon)
  const oz = R * Math.sin(oLat)
  const dx = ix - ox, dy = iy - oy, dz = iz - oz
  const sinLat = Math.sin(oLat), cosLat = Math.cos(oLat)
  const sinLon = Math.sin(oLon), cosLon = Math.cos(oLon)
  const east = -sinLon * dx + cosLon * dy
  const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz
  const up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz
  const alt = Math.atan2(up, Math.sqrt(east * east + north * north)) * RAD
  let az = Math.atan2(east, north) * RAD
  if (az < 0) az += 360
  return { alt, az }
}

// ── Atmospheric extinction ──

function atmosphericDim(alt) {
  if (alt > 20) return 1
  if (alt < 0) return 0.15
  return 0.15 + 0.85 * (alt / 20)
}

function reddenColor(color, alt) {
  if (alt > 15) return color
  const m = color.match(/(\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return color
  let [, r, g, b] = m.map(Number)
  const t = Math.max(0, alt) / 15
  const redness = 1 - t
  r = Math.min(255, r + 40 * redness)
  g = Math.max(0, g - 50 * redness)
  b = Math.max(0, b - 90 * redness)
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

// ── Meteor shower activity ──

function getActiveShowers(date) {
  const year = date.getFullYear()
  const dayOfYear = Math.floor((date - new Date(year, 0, 0)) / 86400000)
  const active = []
  for (const sh of METEOR_RADIANTS) {
    const [mo, da] = sh.peak.split('-').map(Number)
    const peakDOY = Math.floor((new Date(year, mo - 1, da) - new Date(year, 0, 0)) / 86400000)
    let diff = peakDOY - dayOfYear
    if (diff < -180) diff += 365
    if (diff > 180) diff -= 365
    if (Math.abs(diff) <= 7) {
      active.push({ ...sh, daysUntil: Math.max(0, diff),
        effectiveRate: Math.round(sh.rate * Math.max(0.1, 1 - Math.abs(diff) / 7)) })
    }
  }
  return active
}

// ── Rise/Set/Transit for stars & DSOs ──

function findRiseSetTransit(ra, dec, lat, lon, refDate) {
  const res = { rise: null, set: null, transit: null, transitAlt: -90, circumpolar: false, neverRises: false }
  const cosH0 = -Math.tan(lat * DEG) * Math.tan(dec * DEG)
  if (cosH0 < -1) res.circumpolar = true
  else if (cosH0 > 1) { res.neverRises = true; return res }

  const start = new Date(refDate)
  start.setHours(0, 0, 0, 0)
  let prevAlt = null
  for (let m = 0; m <= 1440; m += 5) {
    const t = new Date(start.getTime() + m * 60000)
    const gst = AstroEngine.SiderealTime(new AstroEngine.AstroTime(t))
    const lst = (gst + lon / 15 + 24) % 24
    const { alt } = raDecToAltAz(ra, dec, lst, lat)
    if (prevAlt !== null) {
      if (prevAlt <= 0 && alt > 0 && !res.rise) res.rise = new Date(t.getTime() - 150000)
      if (prevAlt > 0 && alt <= 0 && !res.set) res.set = new Date(t.getTime() - 150000)
    }
    if (alt > res.transitAlt) { res.transitAlt = alt; res.transit = new Date(t) }
    prevAlt = alt
  }
  return res
}

// ── Angular separation ──

function angularSep(alt1, az1, alt2, az2) {
  const a1 = alt1 * DEG, a2 = alt2 * DEG, daz = (az2 - az1) * DEG
  return Math.acos(Math.max(-1, Math.min(1,
    Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(daz)))) * RAD
}

function formatTime(date) {
  return fmtTime(date)
}

function compassLabel(az) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8]
}

// ── Toolbar Button ──

function TBtn({ active, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
        active ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-white/40 hover:bg-white/10 hover:text-white/60'
      }`}>
      {children}
    </button>
  )
}

// ════════════════════════════════════════════════════
// ── SkyMap Component ──
// ════════════════════════════════════════════════════

export default function SkyMap({ lat, lon, onClose }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const stateRef = useRef({
    lookAz: 180, lookAlt: 45, fov: 100,
    dragging: false, lastX: 0, lastY: 0, startX: 0, startY: 0, pinchDist: 0,
    needsRecalc: true,
    // Computed positions
    starPositions: [], planetPositions: [], moonPos: null,
    milkyWayPositions: [], dsoPositions: [], eclipticPoints: [],
    activeShowers: [], sunAlt: -90, lst: 0,
    // ISS
    issPositions: [], issCurrentIdx: 0,
    // Kp
    kpIndex: 0,
    // Settings (synced from React state)
    showGrid: false, showEcliptic: false, timeOffset: 0, magLimit: 4.0,
    // Animation
    meteors: [],
    panTarget: null, panStartAz: 0, panStartAlt: 0, panStartTime: 0, panDuration: 800,
    highlightTarget: null, highlightStart: 0,
  })

  // React state for UI
  const [selected, setSelected] = useState(null)
  const [compassAz, setCompassAz] = useState(180)
  const [nightVision, setNightVision] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showTimeSlider, setShowTimeSlider] = useState(false)
  const [timeOffset, setTimeOffset] = useState(0)
  const [showHighlights, setShowHighlights] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [showEcliptic, setShowEcliptic] = useState(false)
  const [gyroMode, setGyroMode] = useState(false)
  const [magLevelIdx, setMagLevelIdx] = useState(0)
  const [, forceUpdate] = useState(0)

  const magLimit = MAG_LEVELS[magLevelIdx]

  // Twinkle phases
  const twinkleRef = useRef(STARS.map(() => ({
    phase: Math.random() * TWO_PI, speed: 0.5 + Math.random() * 2,
  })))

  // ── Sync settings to stateRef ──
  useEffect(() => { stateRef.current.showGrid = showGrid }, [showGrid])
  useEffect(() => { stateRef.current.showEcliptic = showEcliptic }, [showEcliptic])
  useEffect(() => { stateRef.current.timeOffset = timeOffset; stateRef.current.needsRecalc = true }, [timeOffset])
  useEffect(() => { stateRef.current.magLimit = magLimit }, [magLimit])

  // Tick time display every 60s
  useEffect(() => {
    const iv = setInterval(() => forceUpdate(v => v + 1), 60000)
    return () => clearInterval(iv)
  }, [])

  // ── Fetch ISS positions ──
  useEffect(() => {
    if (timeOffset !== 0) { stateRef.current.issPositions = []; return }
    let mounted = true
    const fetchISS = async () => {
      try {
        const now = Math.floor(Date.now() / 1000)
        const ts = []
        for (let i = -6; i <= 6; i++) ts.push(now + i * 20)
        const res = await fetch(
          `https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=${ts.join(',')}&units=kilometers`
        )
        if (!res.ok) return
        const positions = await res.json()
        if (!mounted) return
        stateRef.current.issPositions = positions.map(p => ({
          ...issToAltAz(p.latitude, p.longitude, p.altitude, lat, lon),
          altitude: p.altitude, lat: p.latitude, lon: p.longitude,
        }))
        stateRef.current.issCurrentIdx = 6
      } catch { /* ISS optional */ }
    }
    fetchISS()
    const iv = setInterval(fetchISS, 15000)
    return () => { mounted = false; clearInterval(iv) }
  }, [lat, lon, timeOffset])

  // ── Fetch Kp index ──
  useEffect(() => {
    let mounted = true
    const fetchKp = async () => {
      try {
        const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
        const data = await res.json()
        if (!mounted) return
        stateRef.current.kpIndex = parseFloat(data[data.length - 1]?.[1]) || 0
      } catch { /* Kp optional */ }
    }
    fetchKp()
    const iv = setInterval(fetchKp, 300000)
    return () => { mounted = false; clearInterval(iv) }
  }, [])

  // ── Gyroscope ──
  useEffect(() => {
    if (!gyroMode) return
    const handler = (e) => {
      if (e.alpha == null) return
      const s = stateRef.current
      s.lookAz = (360 - e.alpha + 360) % 360
      s.lookAlt = Math.max(-10, Math.min(90, e.beta || 45))
      s.needsRecalc = true
      setCompassAz(Math.round(s.lookAz))
    }
    const setup = async () => {
      if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
        try {
          const perm = await DeviceOrientationEvent.requestPermission()
          if (perm !== 'granted') { setGyroMode(false); return }
        } catch { setGyroMode(false); return }
      }
      window.addEventListener('deviceorientation', handler, true)
    }
    setup()
    return () => window.removeEventListener('deviceorientation', handler, true)
  }, [gyroMode])

  // ── Searchable objects ──
  const searchableObjects = useMemo(() => {
    const objs = []
    STARS.forEach((s, i) => { if (s.name) objs.push({ name: s.name, type: 'Star', idx: i, ra: s.ra, dec: s.dec }) })
    PLANETS.forEach(p => objs.push({ name: p.name, type: 'Planet' }))
    objs.push({ name: 'Moon', type: 'Moon' })
    objs.push({ name: 'ISS', type: 'Satellite' })
    DEEP_SKY_OBJECTS.forEach(d => objs.push({ name: d.name, altName: d.id, type: 'DSO', ra: d.ra, dec: d.dec }))
    CONSTELLATIONS.forEach(c => objs.push({ name: c.name, type: 'Constellation', abbr: c.abbr }))
    return objs
  }, [])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return searchableObjects.filter(o =>
      o.name.toLowerCase().includes(q) || (o.altName && o.altName.toLowerCase().includes(q))
    ).slice(0, 8)
  }, [searchQuery, searchableObjects])

  const handleSelectResult = useCallback((result) => {
    const s = stateRef.current
    let tAlt, tAz
    if (result.type === 'Star') {
      const star = s.starPositions[result.idx]
      if (star) { tAlt = star.alt; tAz = star.az }
    } else if (result.type === 'Planet') {
      const p = s.planetPositions.find(x => x.name === result.name)
      if (p) { tAlt = p.alt; tAz = p.az }
    } else if (result.type === 'Moon' && s.moonPos) {
      tAlt = s.moonPos.alt; tAz = s.moonPos.az
    } else if (result.type === 'Satellite') {
      const iss = s.issPositions?.[s.issCurrentIdx]
      if (iss) { tAlt = iss.alt; tAz = iss.az }
    } else if (result.type === 'DSO') {
      const dso = s.dsoPositions?.find(d => d.name === result.name)
      if (dso) { tAlt = dso.alt; tAz = dso.az }
    } else if (result.type === 'Constellation') {
      const cs = s.starPositions.filter(st => st.con === result.abbr && st.visible)
      if (cs.length) { const b = cs.reduce((a, c) => a.mag < c.mag ? a : c); tAlt = b.alt; tAz = b.az }
    }
    if (tAlt !== undefined) {
      s.panTarget = { az: tAz, alt: Math.max(5, tAlt) }
      s.panStartAz = s.lookAz; s.panStartAlt = s.lookAlt
      s.panStartTime = performance.now(); s.panDuration = 800
      s.highlightTarget = { az: tAz, alt: tAlt }; s.highlightStart = performance.now()
    }
    setShowSearch(false); setSearchQuery('')
  }, [])

  // ── Highlights ──
  const highlights = useMemo(() => {
    const s = stateRef.current
    if (!showHighlights || !s.planetPositions.length) return []
    const now = new Date(Date.now() + timeOffset * 60000)
    const sunAlt = SunCalc.getPosition(now, lat, lon).altitude * RAD
    const items = []

    // Sky conditions
    if (sunAlt < -18) items.push({ icon: 'dark', text: 'Astronomical darkness — ideal viewing' })
    else if (sunAlt < -12) items.push({ icon: 'twi', text: 'Nautical twilight — good conditions' })
    else if (sunAlt < -6) items.push({ icon: 'twi', text: 'Civil twilight — bright sky' })
    else if (sunAlt < 0) items.push({ icon: 'twi', text: 'Twilight — limited visibility' })
    else items.push({ icon: 'day', text: 'Daytime — use Time Travel for night sky' })

    // Visible planets
    const vis = s.planetPositions.filter(p => p.alt > 5 && p.visible)
    if (vis.length) items.push({ icon: 'planet', text: `${vis.map(p => p.name).join(', ')} visible` })

    // Moon
    if (s.moonPos?.visible)
      items.push({ icon: 'moon', text: `Moon ${(s.moonPos.illumination * 100).toFixed(0)}% illuminated` })

    // Meteor showers
    for (const sh of s.activeShowers || [])
      items.push({ icon: 'meteor', text: `${sh.name}${sh.daysUntil === 0 ? ' peak tonight!' : ` peak in ${sh.daysUntil}d`} (${sh.rate}/hr)` })

    // ISS
    const iss = s.issPositions?.[s.issCurrentIdx]
    if (iss?.alt > 10) items.push({ icon: 'iss', text: 'ISS currently visible overhead!' })

    // Conjunctions
    for (let i = 0; i < s.planetPositions.length; i++) {
      for (let j = i + 1; j < s.planetPositions.length; j++) {
        const p1 = s.planetPositions[i], p2 = s.planetPositions[j]
        if (!p1.visible || !p2.visible || p1.alt < 3 || p2.alt < 3) continue
        const sep = angularSep(p1.alt, p1.az, p2.alt, p2.az)
        if (sep < 5) items.push({ icon: 'conj', text: `${p1.name} & ${p2.name} ${sep.toFixed(1)}° apart` })
      }
    }

    // Aurora
    if (s.kpIndex >= 5) items.push({ icon: 'aurora', text: `Kp ${s.kpIndex.toFixed(0)} — Aurora possible!` })

    return items
  }, [showHighlights, timeOffset, lat, lon])

  // ── Recalculate positions ──
  const recalcPositions = useCallback(() => {
    const s = stateRef.current
    const now = new Date(Date.now() + s.timeOffset * 60000)
    const observer = new AstroEngine.Observer(lat, lon, 0)
    const gst = AstroEngine.SiderealTime(new AstroEngine.AstroTime(now))
    const lst = (gst + lon / 15 + 24) % 24
    s.lst = lst

    // Sun altitude
    s.sunAlt = SunCalc.getPosition(now, lat, lon).altitude * RAD

    // Stars
    s.starPositions = STARS.map(star => {
      const { alt, az } = raDecToAltAz(star.ra, star.dec, lst, lat)
      return { ...star, alt, az, visible: alt > -2 }
    })

    // Planets
    s.planetPositions = PLANETS.map(p => {
      try {
        const equ = AstroEngine.Equator(p.body, now, observer, true, true)
        const hor = AstroEngine.Horizon(now, observer, equ.ra, equ.dec, 'normal')
        return { ...p, alt: hor.altitude, az: hor.azimuth, visible: hor.altitude > -2,
          ra: equ.ra, dec: equ.dec }
      } catch { return { ...p, alt: -90, az: 0, visible: false } }
    })

    // Moon
    const moonP = SunCalc.getMoonPosition(now, lat, lon)
    const moonI = SunCalc.getMoonIllumination(now)
    s.moonPos = {
      alt: moonP.altitude * RAD, az: (moonP.azimuth * RAD + 180) % 360,
      illumination: moonI.fraction, phase: moonI.phase, visible: moonP.altitude > -0.05,
    }

    // DSOs
    s.dsoPositions = DEEP_SKY_OBJECTS.map(dso => {
      const { alt, az } = raDecToAltAz(dso.ra, dso.dec, lst, lat)
      return { ...dso, alt, az, visible: alt > -2 }
    })

    // Milky Way
    s.milkyWayPositions = MILKY_WAY_BAND.map(p => {
      const { alt, az } = raDecToAltAz(p.ra, p.dec, lst, lat)
      return { alt, az, width: p.width, brightness: p.brightness }
    })

    // Ecliptic
    s.eclipticPoints = []
    for (let ecLon = 0; ecLon < 360; ecLon += 3) {
      const lonR = ecLon * DEG
      const raR = Math.atan2(Math.sin(lonR) * Math.cos(OBLIQUITY), Math.cos(lonR))
      const decR = Math.asin(Math.sin(lonR) * Math.sin(OBLIQUITY))
      const { alt, az } = raDecToAltAz(((raR * RAD / 15) + 24) % 24, decR * RAD, lst, lat)
      s.eclipticPoints.push({ alt, az })
    }

    // Active meteor showers
    s.activeShowers = getActiveShowers(now).map(sh => {
      const { alt, az } = raDecToAltAz(sh.ra, sh.dec, lst, lat)
      return { ...sh, alt, az }
    })

    s.needsRecalc = false
  }, [lat, lon])

  // ── Canvas rendering ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      stateRef.current.needsRecalc = true
    }
    resize()
    window.addEventListener('resize', resize)

    const recalcInterval = setInterval(() => { stateRef.current.needsRecalc = true }, 30000)

    const render = (time) => {
      const s = stateRef.current
      const w = window.innerWidth, h = window.innerHeight

      if (s.needsRecalc) recalcPositions()

      // ── Pan animation ──
      if (s.panTarget) {
        const elapsed = time - s.panStartTime
        const t = Math.min(1, elapsed / s.panDuration)
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        let dAz = s.panTarget.az - s.panStartAz
        if (dAz > 180) dAz -= 360
        if (dAz < -180) dAz += 360
        s.lookAz = ((s.panStartAz + dAz * ease) + 360) % 360
        s.lookAlt = s.panStartAlt + (s.panTarget.alt - s.panStartAlt) * ease
        setCompassAz(Math.round(s.lookAz))
        if (t >= 1) s.panTarget = null
      }

      ctx.clearRect(0, 0, w, h)

      // ═══ 1. SKY GRADIENT (twilight-aware) ═══
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h)
      const sunAlt = s.sunAlt
      if (sunAlt < -18) {
        skyGrad.addColorStop(0, '#050510'); skyGrad.addColorStop(0.6, '#0a0a1a'); skyGrad.addColorStop(1, '#101830')
      } else if (sunAlt < -12) {
        skyGrad.addColorStop(0, '#060512'); skyGrad.addColorStop(0.6, '#0c0c20'); skyGrad.addColorStop(1, '#152040')
      } else if (sunAlt < -6) {
        skyGrad.addColorStop(0, '#0a0a20'); skyGrad.addColorStop(0.6, '#121838'); skyGrad.addColorStop(1, '#1e2855')
      } else if (sunAlt < 0) {
        skyGrad.addColorStop(0, '#101030'); skyGrad.addColorStop(0.5, '#1a1848')
        skyGrad.addColorStop(0.8, '#2a2050'); skyGrad.addColorStop(1, '#4a3050')
      } else if (sunAlt < 10) {
        skyGrad.addColorStop(0, '#203060'); skyGrad.addColorStop(0.5, '#3050a0')
        skyGrad.addColorStop(0.8, '#5060b0'); skyGrad.addColorStop(1, '#806040')
      } else {
        skyGrad.addColorStop(0, '#2050a0'); skyGrad.addColorStop(0.5, '#3070d0'); skyGrad.addColorStop(1, '#70a0e0')
      }
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, w, h)

      // ═══ 2. AURORA GLOW ═══
      if (s.kpIndex >= 4) {
        const auroraAz = lat >= 0 ? 0 : 180
        const horizP = project(5, auroraAz, s.lookAlt, s.lookAz, s.fov, w, h)
        if (horizP) {
          const intensity = Math.min(1, (s.kpIndex - 3) / 6)
          const shimmer = 0.8 + 0.2 * Math.sin(time * 0.001)
          ctx.save()
          const ag = ctx.createRadialGradient(horizP.x, horizP.y, 0, horizP.x, horizP.y, h * 0.5)
          ag.addColorStop(0, `rgba(80,255,120,${0.08 * intensity * shimmer})`)
          ag.addColorStop(0.3, `rgba(60,200,160,${0.05 * intensity * shimmer})`)
          ag.addColorStop(0.6, `rgba(100,120,220,${0.03 * intensity * shimmer})`)
          ag.addColorStop(1, 'transparent')
          ctx.fillStyle = ag
          ctx.fillRect(0, 0, w, h)
          ctx.restore()
        }
      }

      // ═══ 3. ALTITUDE GRID ═══
      if (s.showGrid) {
        ctx.strokeStyle = 'rgba(100,140,200,0.08)'
        ctx.lineWidth = 0.5
        for (const gridAlt of [30, 60]) {
          ctx.beginPath()
          let started = false
          for (let az = 0; az < 360; az += 2) {
            const p = project(gridAlt, az, s.lookAlt, s.lookAz, s.fov, w, h)
            if (p) { if (!started) { ctx.moveTo(p.x, p.y); started = true } else ctx.lineTo(p.x, p.y) }
            else started = false
          }
          ctx.stroke()
          const lp = project(gridAlt, (s.lookAz + 15) % 360, s.lookAlt, s.lookAz, s.fov, w, h)
          if (lp) {
            ctx.fillStyle = 'rgba(100,140,200,0.15)'
            ctx.font = '8px -apple-system, system-ui, sans-serif'
            ctx.textAlign = 'left'
            ctx.fillText(`${gridAlt}°`, lp.x + 4, lp.y - 2)
          }
        }
        for (let az = 0; az < 360; az += 30) {
          ctx.beginPath()
          let started = false
          for (let alt = 0; alt <= 90; alt += 2) {
            const p = project(alt, az, s.lookAlt, s.lookAz, s.fov, w, h)
            if (p) { if (!started) { ctx.moveTo(p.x, p.y); started = true } else ctx.lineTo(p.x, p.y) }
            else started = false
          }
          ctx.stroke()
        }
        const zen = project(90, 0, s.lookAlt, s.lookAz, s.fov, w, h)
        if (zen) {
          ctx.strokeStyle = 'rgba(100,140,200,0.15)'
          ctx.beginPath(); ctx.arc(zen.x, zen.y, 4, 0, TWO_PI); ctx.stroke()
          ctx.fillStyle = 'rgba(100,140,200,0.2)'
          ctx.font = '8px -apple-system, system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('Zenith', zen.x, zen.y - 8)
        }
      }

      // ═══ 4. MILKY WAY (enhanced multi-pass) ═══
      const mwProj = s.milkyWayPositions.map(p => ({
        ...p, proj: project(p.alt, p.az, s.lookAlt, s.lookAz, s.fov, w, h)
      })).filter(p => p.proj)

      if (mwProj.length > 3) {
        const fovScale = Math.min(w, h) / s.fov * 0.4
        for (let pass = 0; pass < 3; pass++) {
          const wMul = [1.0, 0.6, 0.3][pass]
          const aMul = [0.025, 0.04, 0.06][pass]
          ctx.save()
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'
          for (let i = 1; i < mwProj.length; i++) {
            const p0 = mwProj[i - 1], p1 = mwProj[i]
            const avgB = (p0.brightness + p1.brightness) / 2
            const avgW = (p0.width + p1.width) / 2
            ctx.globalAlpha = aMul * avgB
            ctx.strokeStyle = '#8898c0'
            ctx.lineWidth = Math.max(8, avgW * wMul * fovScale)
            ctx.beginPath()
            ctx.moveTo(p0.proj.x, p0.proj.y)
            ctx.lineTo(p1.proj.x, p1.proj.y)
            ctx.stroke()
          }
          ctx.restore()
        }
      }

      // ═══ 5. ECLIPTIC LINE ═══
      if (s.showEcliptic && s.eclipticPoints.length) {
        ctx.save()
        ctx.setLineDash([5, 7])
        ctx.strokeStyle = 'rgba(255,200,80,0.18)'
        ctx.lineWidth = 1
        ctx.beginPath()
        let started = false
        for (const ep of s.eclipticPoints) {
          if (ep.alt < -5) { started = false; continue }
          const p = project(ep.alt, ep.az, s.lookAlt, s.lookAz, s.fov, w, h)
          if (p) { if (!started) { ctx.moveTo(p.x, p.y); started = true } else ctx.lineTo(p.x, p.y) }
          else started = false
        }
        ctx.stroke()
        ctx.setLineDash([])
        // Label
        const midEp = s.eclipticPoints[40]
        if (midEp) {
          const lp = project(midEp.alt, midEp.az, s.lookAlt, s.lookAz, s.fov, w, h)
          if (lp) {
            ctx.fillStyle = 'rgba(255,200,80,0.25)'
            ctx.font = '8px -apple-system, system-ui, sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText('Ecliptic', lp.x, lp.y - 6)
          }
        }
        ctx.restore()
      }

      // ═══ 6. CONSTELLATION LINES ═══
      ctx.strokeStyle = 'rgba(100,160,220,0.12)'
      ctx.lineWidth = 1
      for (const con of CONSTELLATIONS) {
        for (const [i, j] of con.lines) {
          if (i < 0 || j < 0) continue
          const s1 = s.starPositions[i], s2 = s.starPositions[j]
          if (!s1?.visible || !s2?.visible) continue
          const p1 = project(s1.alt, s1.az, s.lookAlt, s.lookAz, s.fov, w, h)
          const p2 = project(s2.alt, s2.az, s.lookAlt, s.lookAz, s.fov, w, h)
          if (!p1 || !p2) continue
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke()
        }
      }

      // ═══ 7. CONSTELLATION LABELS ═══
      ctx.textAlign = 'center'
      for (const con of CONSTELLATIONS) {
        const conStars = s.starPositions.filter(st => st.con === con.abbr && st.visible)
        if (!conStars.length) continue
        const anchor = conStars.reduce((a, b) => a.mag < b.mag ? a : b)
        if (anchor.mag > s.magLimit) continue
        const p = project(anchor.alt, anchor.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (p) {
          ctx.fillStyle = 'rgba(100,160,220,0.30)'
          ctx.font = '9px -apple-system, system-ui, sans-serif'
          ctx.fillText(con.name, p.x, p.y - magToSize(anchor.mag) - 8)
        }
      }

      // ═══ 8. DEEP SKY OBJECTS ═══
      const dsoScale = Math.min(w, h) / s.fov
      for (const dso of s.dsoPositions) {
        if (!dso.visible) continue
        const p = project(dso.alt, dso.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (!p) continue
        const size = Math.max(3, Math.min(20, dso.size * dsoScale * 0.3))
        const [cr, cg, cb] = DSO_COLORS[dso.type] || [128, 128, 128]
        const dim = atmosphericDim(dso.alt)

        ctx.save()
        ctx.globalAlpha = 0.25 * dim
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size)
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.5)`)
        grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.2)`)
        grad.addColorStop(1, 'transparent')
        ctx.fillStyle = grad
        ctx.fillRect(p.x - size, p.y - size, size * 2, size * 2)
        ctx.restore()

        if (s.fov < 110) {
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.35 * dim})`
          ctx.font = '8px -apple-system, system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(dso.id, p.x, p.y + size + 10)
        }
      }

      // ═══ 9. STARS (with atmospheric effects, spikes, mag filter) ═══
      const twinkles = twinkleRef.current
      for (let i = 0; i < s.starPositions.length; i++) {
        const star = s.starPositions[i]
        if (!star.visible || star.mag > s.magLimit) continue
        const p = project(star.alt, star.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (!p) continue

        const size = magToSize(star.mag)
        const tw = twinkles[i]
        const twinkle = 0.7 + 0.3 * Math.sin(time * 0.001 * tw.speed + tw.phase)
        const dim = atmosphericDim(star.alt)
        const color = reddenColor(bvToColor(star.bv), star.alt)

        // Diffraction spikes for brightest stars
        if (star.mag < 1.0) {
          ctx.save()
          ctx.globalAlpha = 0.25 * twinkle * dim
          ctx.strokeStyle = color
          ctx.lineWidth = 0.5
          const spikeLen = (2 - star.mag) * 5
          for (let a = 0; a < 4; a++) {
            const angle = a * Math.PI / 4 + Math.PI / 8
            ctx.beginPath()
            ctx.moveTo(p.x - Math.cos(angle) * spikeLen, p.y - Math.sin(angle) * spikeLen)
            ctx.lineTo(p.x + Math.cos(angle) * spikeLen, p.y + Math.sin(angle) * spikeLen)
            ctx.stroke()
          }
          ctx.restore()
        }

        // Glow for bright stars
        if (star.mag < 1.5) {
          ctx.save()
          ctx.globalAlpha = 0.15 * twinkle * dim
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 4)
          glow.addColorStop(0, color); glow.addColorStop(1, 'transparent')
          ctx.fillStyle = glow
          ctx.fillRect(p.x - size * 4, p.y - size * 4, size * 8, size * 8)
          ctx.restore()
        }

        ctx.save()
        ctx.globalAlpha = twinkle * dim
        ctx.fillStyle = color
        ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, TWO_PI); ctx.fill()
        ctx.restore()

        // Name label
        if (star.mag < 1.8 && s.fov < 120) {
          ctx.save()
          ctx.globalAlpha = 0.55 * dim
          ctx.fillStyle = '#c8d0e0'
          ctx.font = '10px -apple-system, system-ui, sans-serif'
          ctx.textAlign = 'left'
          ctx.fillText(star.name, p.x + size + 4, p.y + 3)
          ctx.restore()
        }
      }

      // ═══ 10. PLANETS ═══
      for (const planet of s.planetPositions) {
        if (!planet.visible) continue
        const p = project(planet.alt, planet.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (!p) continue
        const dim = atmosphericDim(planet.alt)

        ctx.save()
        ctx.globalAlpha = 0.25 * dim
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, planet.size * 4)
        glow.addColorStop(0, planet.color); glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.fillRect(p.x - planet.size * 4, p.y - planet.size * 4, planet.size * 8, planet.size * 8)
        ctx.restore()

        ctx.globalAlpha = dim
        ctx.fillStyle = planet.color
        ctx.beginPath(); ctx.arc(p.x, p.y, planet.size, 0, TWO_PI); ctx.fill()
        ctx.globalAlpha = 1

        ctx.fillStyle = planet.color
        ctx.font = 'bold 10px -apple-system, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(planet.name, p.x, p.y - planet.size - 6)
      }

      // ═══ 11. MOON ═══
      if (s.moonPos?.visible) {
        const p = project(s.moonPos.alt, s.moonPos.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (p) {
          const moonR = 8
          ctx.save()
          ctx.globalAlpha = 0.15
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, moonR * 5)
          glow.addColorStop(0, '#ffe8c0'); glow.addColorStop(1, 'transparent')
          ctx.fillStyle = glow
          ctx.fillRect(p.x - moonR * 5, p.y - moonR * 5, moonR * 10, moonR * 10)
          ctx.restore()

          ctx.fillStyle = '#f0e8d0'
          ctx.beginPath(); ctx.arc(p.x, p.y, moonR, 0, TWO_PI); ctx.fill()

          // Phase shadow
          const phase = s.moonPos.phase
          ctx.save()
          ctx.globalCompositeOperation = 'source-atop'
          ctx.fillStyle = 'rgba(10,10,26,0.75)'
          ctx.beginPath()
          if (phase < 0.5) {
            const termX = moonR * Math.cos(phase * Math.PI * 2)
            ctx.ellipse(p.x, p.y, Math.abs(termX) || 0.5, moonR, 0, -Math.PI / 2, Math.PI / 2, phase > 0.25)
            ctx.arc(p.x, p.y, moonR, Math.PI / 2, -Math.PI / 2, false)
          } else {
            const termX = moonR * Math.cos(phase * Math.PI * 2)
            ctx.ellipse(p.x, p.y, Math.abs(termX) || 0.5, moonR, 0, -Math.PI / 2, Math.PI / 2, phase < 0.75)
            ctx.arc(p.x, p.y, moonR, Math.PI / 2, -Math.PI / 2, true)
          }
          ctx.fill()
          ctx.restore()

          ctx.fillStyle = '#f0e8d0'
          ctx.font = 'bold 10px -apple-system, system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('Moon', p.x, p.y - moonR - 6)
        }
      }

      // ═══ 12. ISS TRAJECTORY ═══
      const issPos = s.issPositions
      if (issPos?.length && s.timeOffset === 0) {
        const ci = s.issCurrentIdx || Math.floor(issPos.length / 2)
        const projISS = issPos.map(ip => ({ ...ip, proj: project(ip.alt, ip.az, s.lookAlt, s.lookAz, s.fov, w, h) }))

        // Past trajectory
        ctx.save()
        ctx.strokeStyle = 'rgba(255,200,50,0.3)'; ctx.lineWidth = 1.5
        ctx.beginPath()
        let started = false
        for (let i = 0; i <= ci; i++) {
          if (projISS[i].proj && projISS[i].alt > 0) {
            if (!started) { ctx.moveTo(projISS[i].proj.x, projISS[i].proj.y); started = true }
            else ctx.lineTo(projISS[i].proj.x, projISS[i].proj.y)
          } else started = false
        }
        ctx.stroke()

        // Future trajectory
        ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,200,50,0.2)'
        ctx.beginPath()
        started = false
        for (let i = ci; i < projISS.length; i++) {
          if (projISS[i].proj && projISS[i].alt > 0) {
            if (!started) { ctx.moveTo(projISS[i].proj.x, projISS[i].proj.y); started = true }
            else ctx.lineTo(projISS[i].proj.x, projISS[i].proj.y)
          } else started = false
        }
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()

        // Current position
        const curr = projISS[ci]
        if (curr?.proj && curr.alt > 0) {
          ctx.save()
          ctx.globalAlpha = 0.4
          const ig = ctx.createRadialGradient(curr.proj.x, curr.proj.y, 0, curr.proj.x, curr.proj.y, 12)
          ig.addColorStop(0, '#ffcc33'); ig.addColorStop(1, 'transparent')
          ctx.fillStyle = ig
          ctx.fillRect(curr.proj.x - 12, curr.proj.y - 12, 24, 24)
          ctx.restore()

          ctx.fillStyle = '#ffcc33'
          ctx.beginPath(); ctx.arc(curr.proj.x, curr.proj.y, 3, 0, TWO_PI); ctx.fill()
          ctx.font = 'bold 9px -apple-system, system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('ISS', curr.proj.x, curr.proj.y - 8)
        }
      }

      // ═══ 13. METEOR SHOWER RADIANTS ═══
      for (const shower of s.activeShowers || []) {
        if (shower.alt < 0) continue
        const p = project(shower.alt, shower.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (!p) continue

        ctx.save()
        ctx.globalAlpha = 0.5
        ctx.strokeStyle = '#ffcc44'; ctx.lineWidth = 1
        for (let a = 0; a < 8; a++) {
          const angle = a * Math.PI / 4 + time * 0.0003
          ctx.beginPath()
          ctx.moveTo(p.x + Math.cos(angle) * 3, p.y + Math.sin(angle) * 3)
          ctx.lineTo(p.x + Math.cos(angle) * 8, p.y + Math.sin(angle) * 8)
          ctx.stroke()
        }
        ctx.restore()

        ctx.fillStyle = 'rgba(255,204,68,0.55)'
        ctx.font = '9px -apple-system, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(shower.name, p.x, p.y - 12)
        if (shower.daysUntil <= 2) {
          ctx.font = '7px -apple-system, system-ui, sans-serif'
          ctx.fillStyle = 'rgba(255,204,68,0.4)'
          ctx.fillText(`${shower.effectiveRate}/hr`, p.x, p.y + 14)
        }
      }

      // ═══ 14. SPORADIC METEORS ═══
      if (sunAlt < -6 && Math.random() < 0.0004) {
        s.meteors.push({
          x: Math.random() * w, y: Math.random() * h * 0.7,
          angle: Math.PI * 0.3 + Math.random() * Math.PI * 0.4,
          len: 30 + Math.random() * 60, life: 250 + Math.random() * 350, born: time,
        })
      }
      s.meteors = s.meteors.filter(m => {
        const age = time - m.born
        if (age > m.life) return false
        const progress = age / m.life
        const alpha = (1 - progress) * 0.8
        const len = m.len * (1 - progress * 0.5)
        const ex = m.x + Math.cos(m.angle) * len
        const ey = m.y + Math.sin(m.angle) * len
        ctx.save()
        const mg = ctx.createLinearGradient(m.x, m.y, ex, ey)
        mg.addColorStop(0, `rgba(255,255,255,${alpha})`); mg.addColorStop(0.3, `rgba(255,255,200,${alpha * 0.6})`)
        mg.addColorStop(1, 'transparent')
        ctx.strokeStyle = mg; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(ex, ey); ctx.stroke()
        ctx.restore()
        return true
      })

      // ═══ 15. HORIZON ═══
      const horizP = project(0, s.lookAz, s.lookAlt, s.lookAz, s.fov, w, h)
      if (horizP) {
        const hy = horizP.y
        if (hy < h + 50) {
          const hg = ctx.createLinearGradient(0, hy - 30, 0, h)
          hg.addColorStop(0, 'rgba(15,18,35,0)'); hg.addColorStop(0.3, 'rgba(15,18,35,0.7)')
          hg.addColorStop(1, 'rgba(15,18,35,1)')
          ctx.fillStyle = hg; ctx.fillRect(0, hy - 30, w, h - hy + 30)
          ctx.strokeStyle = 'rgba(80,100,140,0.3)'; ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(w, hy); ctx.stroke()
        }
      }

      // ═══ 16. CARDINAL DIRECTIONS ═══
      for (const c of CARDINALS) {
        const p = project(0, c.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (!p) continue
        const isMain = c.label.length === 1
        ctx.fillStyle = isMain ? 'rgba(200,210,230,0.7)' : 'rgba(200,210,230,0.35)'
        ctx.font = isMain ? 'bold 13px -apple-system, system-ui, sans-serif' : '10px -apple-system, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(c.label, p.x, p.y + 18)
      }

      // ═══ 17. HIGHLIGHT RING (search result) ═══
      if (s.highlightTarget) {
        const elapsed = time - s.highlightStart
        if (elapsed > 3000) { s.highlightTarget = null }
        else {
          const hp = project(s.highlightTarget.alt, s.highlightTarget.az, s.lookAlt, s.lookAz, s.fov, w, h)
          if (hp) {
            const pulse = 0.5 + 0.5 * Math.sin(elapsed * 0.006)
            ctx.save()
            ctx.globalAlpha = (0.4 + 0.3 * pulse) * Math.max(0, 1 - elapsed / 3000)
            ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 2
            ctx.beginPath(); ctx.arc(hp.x, hp.y, 15 + 5 * pulse, 0, TWO_PI); ctx.stroke()
            ctx.restore()
          }
        }
      }

      // ═══ 18. TOP GRADIENT ═══
      const topGrad = ctx.createLinearGradient(0, 0, 0, 70)
      topGrad.addColorStop(0, 'rgba(5,5,16,0.8)'); topGrad.addColorStop(1, 'rgba(5,5,16,0)')
      ctx.fillStyle = topGrad; ctx.fillRect(0, 0, w, 70)

      animRef.current = requestAnimationFrame(render)
    }

    recalcPositions()
    animRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animRef.current)
      clearInterval(recalcInterval)
      window.removeEventListener('resize', resize)
    }
  }, [lat, lon, recalcPositions])

  // ── Pointer / Touch handlers ──
  const handlePointerDown = useCallback((e) => {
    const s = stateRef.current
    if (gyroMode) return
    s.dragging = true; s.lastX = e.clientX; s.lastY = e.clientY; s.startX = e.clientX; s.startY = e.clientY
  }, [gyroMode])

  const handlePointerMove = useCallback((e) => {
    const s = stateRef.current
    if (!s.dragging || gyroMode) return
    const dx = e.clientX - s.lastX, dy = e.clientY - s.lastY
    s.lastX = e.clientX; s.lastY = e.clientY
    const sens = s.fov / window.innerWidth
    s.lookAz = (s.lookAz - dx * sens + 360) % 360
    s.lookAlt = Math.max(-10, Math.min(90, s.lookAlt + dy * sens))
    s.needsRecalc = true
    setCompassAz(Math.round(s.lookAz))
  }, [gyroMode])

  const handlePointerUp = useCallback(() => { stateRef.current.dragging = false }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const s = stateRef.current
    s.fov = Math.max(20, Math.min(150, s.fov + e.deltaY * 0.05))
    s.needsRecalc = true
  }, [])

  const handleTouchStart = useCallback((e) => {
    if (gyroMode) return
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      stateRef.current.pinchDist = Math.hypot(dx, dy)
    } else if (e.touches.length === 1) {
      stateRef.current.dragging = true
      stateRef.current.lastX = e.touches[0].clientX
      stateRef.current.lastY = e.touches[0].clientY
      stateRef.current.startX = e.touches[0].clientX
      stateRef.current.startY = e.touches[0].clientY
    }
  }, [gyroMode])

  const handleTouchMove = useCallback((e) => {
    e.preventDefault()
    if (gyroMode) return
    const s = stateRef.current
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      if (s.pinchDist > 0) {
        s.fov = Math.max(20, Math.min(150, s.fov * (s.pinchDist / dist)))
        s.needsRecalc = true
      }
      s.pinchDist = dist
    } else if (e.touches.length === 1 && s.dragging) {
      const dx = e.touches[0].clientX - s.lastX, dy = e.touches[0].clientY - s.lastY
      s.lastX = e.touches[0].clientX; s.lastY = e.touches[0].clientY
      const sens = s.fov / window.innerWidth
      s.lookAz = (s.lookAz - dx * sens + 360) % 360
      s.lookAlt = Math.max(-10, Math.min(90, s.lookAlt + dy * sens))
      s.needsRecalc = true
      setCompassAz(Math.round(s.lookAz))
    }
  }, [gyroMode])

  const handleTouchEnd = useCallback(() => {
    stateRef.current.dragging = false; stateRef.current.pinchDist = 0
  }, [])

  // ── Tap to select ──
  const handleClick = useCallback((e) => {
    const s = stateRef.current
    const w = window.innerWidth, h = window.innerHeight
    const cx = e.clientX, cy = e.clientY

    if (Math.abs(cx - s.startX) > 8 || Math.abs(cy - s.startY) > 8) return
    if (cx < 60 && cy < 60) { onClose(); return }

    const now = new Date(Date.now() + s.timeOffset * 60000)
    let closest = null, closestDist = 25

    // Planets
    for (const planet of s.planetPositions) {
      if (!planet.visible) continue
      const p = project(planet.alt, planet.az, s.lookAlt, s.lookAz, s.fov, w, h)
      if (!p) continue
      const d = Math.hypot(p.x - cx, p.y - cy)
      if (d < closestDist) {
        closestDist = d
        let rise, set, transit, transitAlt
        try {
          const obs = new AstroEngine.Observer(lat, lon, 0)
          const r = AstroEngine.SearchRiseSet(planet.body, obs, +1, now, 1)
          const st = AstroEngine.SearchRiseSet(planet.body, obs, -1, now, 1)
          const tr = AstroEngine.SearchHourAngle(planet.body, obs, 0, now)
          rise = r?.date; set = st?.date; transit = tr?.time?.date; transitAlt = tr?.hor?.altitude
        } catch { /* ignore */ }
        closest = { name: planet.name, type: 'Planet', alt: planet.alt.toFixed(1), az: planet.az.toFixed(1),
          color: planet.color, rise, set, transit, transitAlt }
      }
    }

    // ISS
    if (s.issPositions?.length && s.timeOffset === 0) {
      const iss = s.issPositions[s.issCurrentIdx]
      if (iss?.alt > 0) {
        const p = project(iss.alt, iss.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (p) {
          const d = Math.hypot(p.x - cx, p.y - cy)
          if (d < closestDist) {
            closestDist = d
            closest = { name: 'ISS', type: 'Satellite', alt: iss.alt.toFixed(1), az: iss.az.toFixed(1),
              detail: `Altitude: ${iss.altitude?.toFixed(0) || '~400'} km`, color: '#ffcc33' }
          }
        }
      }
    }

    // Moon
    if (s.moonPos?.visible) {
      const p = project(s.moonPos.alt, s.moonPos.az, s.lookAlt, s.lookAz, s.fov, w, h)
      if (p) {
        const d = Math.hypot(p.x - cx, p.y - cy)
        if (d < closestDist) {
          closestDist = d
          const mt = SunCalc.getMoonTimes(now, lat, lon)
          closest = { name: 'Moon', type: 'Moon', alt: s.moonPos.alt.toFixed(1), az: s.moonPos.az.toFixed(1),
            detail: `${(s.moonPos.illumination * 100).toFixed(0)}% illuminated`, color: '#f0e8d0',
            rise: mt.rise, set: mt.set }
        }
      }
    }

    // DSOs
    for (const dso of s.dsoPositions) {
      if (!dso.visible) continue
      const p = project(dso.alt, dso.az, s.lookAlt, s.lookAz, s.fov, w, h)
      if (!p) continue
      const d = Math.hypot(p.x - cx, p.y - cy)
      if (d < closestDist) {
        closestDist = d
        const rs = findRiseSetTransit(dso.ra, dso.dec, lat, lon, now)
        const [cr, cg, cb] = DSO_COLORS[dso.type] || [128, 128, 128]
        closest = { name: dso.name, id: dso.id, type: dso.type, alt: dso.alt.toFixed(1), az: dso.az.toFixed(1),
          mag: dso.mag?.toFixed(1), color: `rgb(${cr},${cg},${cb})`, ...rs }
      }
    }

    // Stars
    for (const star of s.starPositions) {
      if (!star.visible || star.mag > s.magLimit) continue
      const p = project(star.alt, star.az, s.lookAlt, s.lookAz, s.fov, w, h)
      if (!p) continue
      const d = Math.hypot(p.x - cx, p.y - cy)
      if (d < closestDist) {
        closestDist = d
        const conName = CONSTELLATIONS.find(c => c.abbr === star.con)?.name || star.con
        const rs = findRiseSetTransit(star.ra, star.dec, lat, lon, now)
        closest = { name: star.name, type: 'Star', mag: star.mag.toFixed(2), constellation: conName,
          alt: star.alt.toFixed(1), az: star.az.toFixed(1), color: bvToColor(star.bv), ...rs }
      }
    }

    setSelected(closest)
  }, [onClose, lat, lon])

  // ═══ JSX ═══
  const nvStyle = nightVision ? { filter: 'brightness(0.7) sepia(1) saturate(3) hue-rotate(-30deg)' } : undefined
  const virtualTime = new Date(Date.now() + timeOffset * 60000)

  return (
    <div className="fixed inset-0 z-[9999] bg-black" style={{ touchAction: 'none', ...nvStyle }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* ── Close button ── */}
      <button onClick={onClose}
        className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white/80 hover:bg-white/20 transition-colors"
        style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}>
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* ── Time + Compass ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center" style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="text-white/70 text-sm font-light tabular-nums">
          {fmtTime(virtualTime)}
        </div>
        <div className="text-white/40 text-[10px] tracking-wider">
          {compassLabel(compassAz)} {compassAz}°
        </div>
        {timeOffset !== 0 && (
          <div className="text-amber-400/60 text-[9px] mt-0.5 tabular-nums">
            {timeOffset > 0 ? '+' : ''}{(timeOffset / 60).toFixed(1)}h &middot;{' '}
            {fmtDate(virtualTime, { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>

      {/* ── Toolbar (right side) ── */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2"
        onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>

        {/* Search */}
        <TBtn active={showSearch} onClick={() => { setShowSearch(!showSearch); setShowHighlights(false) }} title="Search">
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="8" cy="8" r="5.5"/><path d="M12 12l5 5"/>
          </svg>
        </TBtn>

        {/* Time Travel */}
        <TBtn active={showTimeSlider} onClick={() => { setShowTimeSlider(!showTimeSlider); if (showTimeSlider) setTimeOffset(0) }} title="Time Travel">
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="10" cy="10" r="7.5"/><path d="M10 5v5l3 3"/>
          </svg>
        </TBtn>

        {/* Night Vision */}
        <TBtn active={nightVision} onClick={() => setNightVision(!nightVision)} title="Night Vision">
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 10s4-7 9-7 9 7 9 7-4 7-9 7-9-7-9-7z"/><circle cx="10" cy="10" r="3"/>
          </svg>
        </TBtn>

        {/* Grid */}
        <TBtn active={showGrid} onClick={() => setShowGrid(!showGrid)} title="Alt/Az Grid">
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M0 7h20M0 13h20M7 0v20M13 0v20"/>
          </svg>
        </TBtn>

        {/* Ecliptic */}
        <TBtn active={showEcliptic} onClick={() => setShowEcliptic(!showEcliptic)} title="Ecliptic">
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="10" cy="10" r="4"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3"/>
          </svg>
        </TBtn>

        {/* Gyroscope */}
        <TBtn active={gyroMode} onClick={() => setGyroMode(!gyroMode)} title="Gyroscope">
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="10" cy="10" r="7.5"/><path d="M10 2.5v5M10 12.5v5M2.5 10h5M12.5 10h5"/>
            <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
          </svg>
        </TBtn>

        {/* Tonight's Highlights */}
        <TBtn active={showHighlights} onClick={() => { setShowHighlights(!showHighlights); setShowSearch(false) }} title="Tonight's Sky">
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
            <path d="M10 1l2.5 6.5L19 10l-6.5 2.5L10 19l-2.5-6.5L1 10l6.5-2.5z"/>
          </svg>
        </TBtn>

        {/* Magnitude filter */}
        <TBtn active={magLevelIdx > 0} onClick={() => setMagLevelIdx((magLevelIdx + 1) % MAG_LEVELS.length)} title="Star Density">
          <span className="text-[10px] font-bold tracking-tight">
            {['ALL', 'MED', 'FEW'][magLevelIdx]}
          </span>
        </TBtn>
      </div>

      {/* ── Time Travel Slider ── */}
      {showTimeSlider && (
        <div className="absolute bottom-6 left-16 right-16 flex flex-col items-center gap-1"
          onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
          <input
            type="range" min={-720} max={720} step={15} value={timeOffset}
            onChange={e => setTimeOffset(parseInt(e.target.value))}
            className="w-full h-1 appearance-none bg-white/10 rounded-full outline-none
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex justify-between w-full text-white/20 text-[9px] tabular-nums">
            <span>-12h</span>
            <button onClick={() => setTimeOffset(0)} className="text-amber-400/50 hover:text-amber-400 text-[9px]">
              Reset
            </button>
            <span>+12h</span>
          </div>
        </div>
      )}

      {/* ── Search Panel ── */}
      {showSearch && (
        <div className="absolute top-20 right-14 w-60 glass-card p-3"
          style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
          onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
          <input
            type="text" value={searchQuery} autoFocus
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Stars, planets, DSOs..."
            className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
          />
          {searchResults.length > 0 && (
            <div className="mt-2 flex flex-col gap-0.5">
              {searchResults.map(r => (
                <button key={r.name + r.type}
                  onClick={() => handleSelectResult(r)}
                  className="text-left px-2 py-1.5 rounded hover:bg-white/10 transition-colors flex items-center gap-2">
                  <span className="text-white/80 text-sm">{r.altName ? `${r.altName} ` : ''}{r.name}</span>
                  <span className="text-white/30 text-[10px] ml-auto">{r.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tonight's Highlights ── */}
      {showHighlights && highlights.length > 0 && (
        <div className="absolute top-20 left-4 w-64 glass-card p-4 max-h-72 overflow-y-auto"
          style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
          onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
          <div className="text-white/70 font-medium text-xs tracking-wider mb-3">TONIGHT&apos;S SKY</div>
          {highlights.map((h, i) => (
            <div key={i} className="flex gap-2 items-start mb-2.5 text-[11px]">
              <span className="text-white/20 mt-0.5">&#9679;</span>
              <span className="text-white/65 leading-relaxed">{h.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Selected Object Info ── */}
      {selected && (
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 glass-card px-5 py-4 min-w-[240px] max-w-[320px]"
          onClick={(e) => { e.stopPropagation(); setSelected(null) }}
          onPointerDown={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
            <div className="text-white font-medium text-sm">
              {selected.id ? `${selected.id} ` : ''}{selected.name}
            </div>
            <div className="text-white/40 text-xs ml-auto">{selected.type}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <div className="text-white/40">Altitude</div>
            <div className="text-white/70 tabular-nums">{selected.alt}°</div>
            <div className="text-white/40">Azimuth</div>
            <div className="text-white/70 tabular-nums">{selected.az}°</div>
            {selected.mag && <>
              <div className="text-white/40">Magnitude</div>
              <div className="text-white/70 tabular-nums">{selected.mag}</div>
            </>}
            {selected.constellation && <>
              <div className="text-white/40">Constellation</div>
              <div className="text-white/70">{selected.constellation}</div>
            </>}
            {selected.detail && (
              <div className="text-white/50 col-span-2 mt-1 text-[10px]">{selected.detail}</div>
            )}
            {(selected.rise || selected.set || selected.transit) && (
              <div className="col-span-2 mt-2 pt-2 border-t border-white/5 grid grid-cols-2 gap-x-4 gap-y-1">
                {selected.rise && <>
                  <div className="text-white/35">Rises</div>
                  <div className="text-white/60 tabular-nums">{formatTime(selected.rise)}</div>
                </>}
                {selected.transit && <>
                  <div className="text-white/35">Transit</div>
                  <div className="text-white/60 tabular-nums">
                    {formatTime(selected.transit)}{selected.transitAlt != null ? ` (${selected.transitAlt.toFixed(0)}°)` : ''}
                  </div>
                </>}
                {selected.set && <>
                  <div className="text-white/35">Sets</div>
                  <div className="text-white/60 tabular-nums">{formatTime(selected.set)}</div>
                </>}
                {selected.circumpolar && (
                  <div className="text-white/35 col-span-2">Circumpolar &mdash; never sets</div>
                )}
              </div>
            )}
          </div>
          <div className="text-white/20 text-[9px] text-center mt-2">Tap to dismiss</div>
        </div>
      )}
    </div>
  )
}
