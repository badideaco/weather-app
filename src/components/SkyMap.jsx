import { useRef, useEffect, useState, useCallback } from 'react'
import * as AstroEngine from 'astronomy-engine'
import SunCalc from 'suncalc'
import { STARS, CONSTELLATIONS, MILKY_WAY_POINTS, bvToColor } from '../data/starCatalog'

const DEG = Math.PI / 180
const RAD = 180 / Math.PI
const TWO_PI = Math.PI * 2

const PLANETS = [
  { name: 'Mercury', body: AstroEngine.Body.Mercury, color: '#b8b8b8', size: 3 },
  { name: 'Venus', body: AstroEngine.Body.Venus, color: '#fffde0', size: 5 },
  { name: 'Mars', body: AstroEngine.Body.Mars, color: '#e87040', size: 4 },
  { name: 'Jupiter', body: AstroEngine.Body.Jupiter, color: '#f0d8a0', size: 5 },
  { name: 'Saturn', body: AstroEngine.Body.Saturn, color: '#f0e0a0', size: 4 },
]

const CARDINALS = [
  { az: 0, label: 'N' }, { az: 45, label: 'NE' }, { az: 90, label: 'E' },
  { az: 135, label: 'SE' }, { az: 180, label: 'S' }, { az: 225, label: 'SW' },
  { az: 270, label: 'W' }, { az: 315, label: 'NW' },
]

// ── Coordinate conversion ──

function raDecToAltAz(ra, dec, lst, lat) {
  // ra in hours, dec in degrees, lst in hours, lat in degrees
  const ha = (lst - ra) * 15 * DEG // hour angle in radians
  const decR = dec * DEG
  const latR = lat * DEG
  const sinAlt = Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(ha)
  const alt = Math.asin(sinAlt) * RAD
  const cosA = (Math.sin(decR) - Math.sin(alt * DEG) * Math.sin(latR)) / (Math.cos(alt * DEG) * Math.cos(latR))
  let az = Math.acos(Math.max(-1, Math.min(1, cosA))) * RAD
  if (Math.sin(ha) > 0) az = 360 - az
  return { alt, az }
}

// ── Stereographic projection ──

function project(alt, az, lookAlt, lookAz, fov, w, h) {
  // Convert to angular distance from look direction
  const a1 = alt * DEG, a2 = lookAlt * DEG
  const daz = (az - lookAz) * DEG
  const cosDist = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(daz)
  if (cosDist < -0.2) return null // behind us

  const dist = Math.acos(Math.max(-1, Math.min(1, cosDist)))
  if (dist * RAD > fov * 0.7) return null // outside FOV

  // Bearing from look direction to star
  const sinB = Math.cos(a1) * Math.sin(daz)
  const cosB = Math.sin(a1) * Math.cos(a2) - Math.cos(a1) * Math.sin(a2) * Math.cos(daz)
  const bearing = Math.atan2(sinB, cosB)

  // Stereographic radius
  const r = 2 * Math.tan(dist / 2)
  const scale = Math.min(w, h) / (2 * Math.tan((fov * DEG) / 2))

  const x = w / 2 + r * Math.sin(bearing) * scale
  const y = h / 2 - r * Math.cos(bearing) * scale
  return { x, y }
}

// ── Star magnitude → pixel size ──
function magToSize(mag) {
  return Math.max(0.8, 4.5 - mag * 0.9)
}

export default function SkyMap({ lat, lon, onClose }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const stateRef = useRef({
    lookAz: 180, lookAlt: 45, fov: 100,
    dragging: false, lastX: 0, lastY: 0,
    startX: 0, startY: 0,
    pinchDist: 0,
    needsRecalc: true,
    starPositions: [], planetPositions: [], moonPos: null,
    milkyWayPositions: [],
  })
  const [selected, setSelected] = useState(null)
  const [compassAz, setCompassAz] = useState(180)

  // Pre-compute star twinkle phases
  const twinkleRef = useRef(STARS.map(() => ({
    phase: Math.random() * TWO_PI,
    speed: 0.5 + Math.random() * 2,
  })))

  // ── Recalculate positions ──
  const recalcPositions = useCallback(() => {
    const s = stateRef.current
    const now = new Date()
    const observer = new AstroEngine.Observer(lat, lon, 0)

    // Local sidereal time
    const gst = AstroEngine.SiderealTime(new AstroEngine.AstroTime(now))
    const lst = (gst + lon / 15 + 24) % 24

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
        return { ...p, alt: hor.altitude, az: hor.azimuth, visible: hor.altitude > -2 }
      } catch { return { ...p, alt: -90, az: 0, visible: false } }
    })

    // Moon
    const moonP = SunCalc.getMoonPosition(now, lat, lon)
    const moonIllum = SunCalc.getMoonIllumination(now)
    s.moonPos = {
      alt: moonP.altitude * RAD,
      az: (moonP.azimuth * RAD + 180) % 360, // suncalc uses south=0
      illumination: moonIllum.fraction,
      phase: moonIllum.phase,
      visible: moonP.altitude > -0.05,
    }

    // Milky Way
    s.milkyWayPositions = MILKY_WAY_POINTS.map(p => {
      const { alt, az } = raDecToAltAz(p.ra, p.dec, lst, lat)
      return { alt, az }
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
      ctx.scale(dpr, dpr)
      stateRef.current.needsRecalc = true
    }
    resize()
    window.addEventListener('resize', resize)

    // Recalc every 30s for sky rotation
    const recalcInterval = setInterval(() => {
      stateRef.current.needsRecalc = true
    }, 30000)

    const render = (time) => {
      const s = stateRef.current
      const w = window.innerWidth
      const h = window.innerHeight

      if (s.needsRecalc) recalcPositions()

      // Clear
      ctx.clearRect(0, 0, w, h)

      // Sky gradient background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h)
      skyGrad.addColorStop(0, '#050510')
      skyGrad.addColorStop(0.6, '#0a0a1a')
      skyGrad.addColorStop(1, '#101830')
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, w, h)

      // ── Milky Way band ──
      const mwPoints = s.milkyWayPositions
        .map(p => project(p.alt, p.az, s.lookAlt, s.lookAz, s.fov, w, h))
        .filter(Boolean)
      if (mwPoints.length > 3) {
        ctx.save()
        ctx.globalAlpha = 0.04
        ctx.strokeStyle = '#8090c0'
        ctx.lineWidth = Math.max(60, w * 0.12)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(mwPoints[0].x, mwPoints[0].y)
        for (let i = 1; i < mwPoints.length; i++) {
          ctx.lineTo(mwPoints[i].x, mwPoints[i].y)
        }
        ctx.stroke()
        ctx.restore()
      }

      // ── Constellation lines ──
      ctx.strokeStyle = 'rgba(100, 160, 220, 0.12)'
      ctx.lineWidth = 1
      for (const con of CONSTELLATIONS) {
        for (const [i, j] of con.lines) {
          if (i < 0 || j < 0) continue
          const s1 = s.starPositions[i]
          const s2 = s.starPositions[j]
          if (!s1?.visible || !s2?.visible) continue
          const p1 = project(s1.alt, s1.az, s.lookAlt, s.lookAz, s.fov, w, h)
          const p2 = project(s2.alt, s2.az, s.lookAlt, s.lookAz, s.fov, w, h)
          if (!p1 || !p2) continue
          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.stroke()
        }
      }

      // ── Constellation labels ──
      ctx.font = '9px -apple-system, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(100, 160, 220, 0.35)'
      for (const con of CONSTELLATIONS) {
        // Find a representative star for label position
        const conStars = s.starPositions.filter(st => st.con === con.abbr && st.visible)
        if (!conStars.length) continue
        // Use the brightest star of the constellation
        const anchor = conStars.reduce((a, b) => a.mag < b.mag ? a : b)
        const p = project(anchor.alt, anchor.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (p) {
          ctx.fillText(con.name, p.x, p.y - magToSize(anchor.mag) - 8)
        }
      }

      // ── Stars ──
      const twinkles = twinkleRef.current
      for (let i = 0; i < s.starPositions.length; i++) {
        const star = s.starPositions[i]
        if (!star.visible) continue
        const p = project(star.alt, star.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (!p) continue

        const size = magToSize(star.mag)
        const tw = twinkles[i]
        const twinkle = 0.7 + 0.3 * Math.sin(time * 0.001 * tw.speed + tw.phase)

        // Glow for bright stars
        if (star.mag < 1.5) {
          ctx.save()
          ctx.globalAlpha = 0.15 * twinkle
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 4)
          glow.addColorStop(0, bvToColor(star.bv))
          glow.addColorStop(1, 'transparent')
          ctx.fillStyle = glow
          ctx.fillRect(p.x - size * 4, p.y - size * 4, size * 8, size * 8)
          ctx.restore()
        }

        ctx.save()
        ctx.globalAlpha = twinkle
        ctx.fillStyle = bvToColor(star.bv)
        ctx.beginPath()
        ctx.arc(p.x, p.y, size, 0, TWO_PI)
        ctx.fill()
        ctx.restore()

        // Label for bright stars
        if (star.mag < 1.8 && s.fov < 120) {
          ctx.save()
          ctx.globalAlpha = 0.6
          ctx.fillStyle = '#c8d0e0'
          ctx.font = '10px -apple-system, system-ui, sans-serif'
          ctx.textAlign = 'left'
          ctx.fillText(star.name, p.x + size + 4, p.y + 3)
          ctx.restore()
        }
      }

      // ── Planets ──
      for (const planet of s.planetPositions) {
        if (!planet.visible) continue
        const p = project(planet.alt, planet.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (!p) continue

        // Glow
        ctx.save()
        ctx.globalAlpha = 0.25
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, planet.size * 4)
        glow.addColorStop(0, planet.color)
        glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.fillRect(p.x - planet.size * 4, p.y - planet.size * 4, planet.size * 8, planet.size * 8)
        ctx.restore()

        ctx.fillStyle = planet.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, planet.size, 0, TWO_PI)
        ctx.fill()

        // Label
        ctx.fillStyle = planet.color
        ctx.font = 'bold 10px -apple-system, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(planet.name, p.x, p.y - planet.size - 6)
      }

      // ── Moon ──
      if (s.moonPos?.visible) {
        const p = project(s.moonPos.alt, s.moonPos.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (p) {
          const moonR = 8

          // Moon glow
          ctx.save()
          ctx.globalAlpha = 0.15
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, moonR * 5)
          glow.addColorStop(0, '#ffe8c0')
          glow.addColorStop(1, 'transparent')
          ctx.fillStyle = glow
          ctx.fillRect(p.x - moonR * 5, p.y - moonR * 5, moonR * 10, moonR * 10)
          ctx.restore()

          // Moon disc
          ctx.fillStyle = '#f0e8d0'
          ctx.beginPath()
          ctx.arc(p.x, p.y, moonR, 0, TWO_PI)
          ctx.fill()

          // Phase shadow (simplified)
          const phase = s.moonPos.phase
          ctx.save()
          ctx.globalCompositeOperation = 'source-atop'
          ctx.fillStyle = 'rgba(10,10,26,0.75)'
          ctx.beginPath()
          if (phase < 0.5) {
            // waxing — shadow on left
            const termX = moonR * Math.cos(phase * Math.PI * 2)
            ctx.ellipse(p.x, p.y, Math.abs(termX) || 0.5, moonR, 0, -Math.PI / 2, Math.PI / 2, phase > 0.25)
            ctx.arc(p.x, p.y, moonR, Math.PI / 2, -Math.PI / 2, false)
          } else {
            // waning — shadow on right
            const termX = moonR * Math.cos(phase * Math.PI * 2)
            ctx.ellipse(p.x, p.y, Math.abs(termX) || 0.5, moonR, 0, -Math.PI / 2, Math.PI / 2, phase < 0.75)
            ctx.arc(p.x, p.y, moonR, Math.PI / 2, -Math.PI / 2, true)
          }
          ctx.fill()
          ctx.restore()

          // Label
          ctx.fillStyle = '#f0e8d0'
          ctx.font = 'bold 10px -apple-system, system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('Moon', p.x, p.y - moonR - 6)
        }
      }

      // ── Horizon gradient ──
      const horizP = project(0, s.lookAz, s.lookAlt, s.lookAz, s.fov, w, h)
      if (horizP) {
        const horizY = horizP.y
        if (horizY < h + 50) {
          const grad = ctx.createLinearGradient(0, horizY - 30, 0, h)
          grad.addColorStop(0, 'rgba(15,18,35,0)')
          grad.addColorStop(0.3, 'rgba(15,18,35,0.7)')
          grad.addColorStop(1, 'rgba(15,18,35,1)')
          ctx.fillStyle = grad
          ctx.fillRect(0, horizY - 30, w, h - horizY + 30)

          // Horizon line
          ctx.strokeStyle = 'rgba(80,100,140,0.3)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(0, horizY)
          ctx.lineTo(w, horizY)
          ctx.stroke()
        }
      }

      // ── Cardinal directions ──
      ctx.font = '12px -apple-system, system-ui, sans-serif'
      ctx.textAlign = 'center'
      for (const c of CARDINALS) {
        const p = project(0, c.az, s.lookAlt, s.lookAz, s.fov, w, h)
        if (!p) continue
        const isMain = c.label.length === 1
        ctx.fillStyle = isMain ? 'rgba(200,210,230,0.7)' : 'rgba(200,210,230,0.35)'
        ctx.font = isMain ? 'bold 13px -apple-system, system-ui, sans-serif' : '10px -apple-system, system-ui, sans-serif'
        ctx.fillText(c.label, p.x, p.y + 18)
      }

      // ── UI overlay ──
      // Top bar background
      const topGrad = ctx.createLinearGradient(0, 0, 0, 70)
      topGrad.addColorStop(0, 'rgba(5,5,16,0.8)')
      topGrad.addColorStop(1, 'rgba(5,5,16,0)')
      ctx.fillStyle = topGrad
      ctx.fillRect(0, 0, w, 70)

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

  // ── Touch / Mouse handlers ──
  const handlePointerDown = useCallback((e) => {
    const s = stateRef.current
    s.dragging = true
    s.lastX = e.clientX
    s.lastY = e.clientY
    s.startX = e.clientX
    s.startY = e.clientY
  }, [])

  const handlePointerMove = useCallback((e) => {
    const s = stateRef.current
    if (!s.dragging) return
    const dx = e.clientX - s.lastX
    const dy = e.clientY - s.lastY
    s.lastX = e.clientX
    s.lastY = e.clientY

    const sensitivity = s.fov / window.innerWidth
    s.lookAz = (s.lookAz - dx * sensitivity + 360) % 360
    s.lookAlt = Math.max(-10, Math.min(90, s.lookAlt + dy * sensitivity))
    s.needsRecalc = true
    setCompassAz(Math.round(s.lookAz))
  }, [])

  const handlePointerUp = useCallback(() => {
    stateRef.current.dragging = false
  }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const s = stateRef.current
    s.fov = Math.max(30, Math.min(150, s.fov + e.deltaY * 0.05))
    s.needsRecalc = true
  }, [])

  // Pinch zoom for touch
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      stateRef.current.pinchDist = Math.hypot(dx, dy)
    } else if (e.touches.length === 1) {
      stateRef.current.dragging = true
      stateRef.current.lastX = e.touches[0].clientX
      stateRef.current.lastY = e.touches[0].clientY
    }
  }, [])

  const handleTouchMove = useCallback((e) => {
    e.preventDefault()
    const s = stateRef.current
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      if (s.pinchDist > 0) {
        const scale = s.pinchDist / dist
        s.fov = Math.max(30, Math.min(150, s.fov * scale))
        s.needsRecalc = true
      }
      s.pinchDist = dist
    } else if (e.touches.length === 1 && s.dragging) {
      const dx = e.touches[0].clientX - s.lastX
      const dy = e.touches[0].clientY - s.lastY
      s.lastX = e.touches[0].clientX
      s.lastY = e.touches[0].clientY
      const sensitivity = s.fov / window.innerWidth
      s.lookAz = (s.lookAz - dx * sensitivity + 360) % 360
      s.lookAlt = Math.max(-10, Math.min(90, s.lookAlt + dy * sensitivity))
      s.needsRecalc = true
      setCompassAz(Math.round(s.lookAz))
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    stateRef.current.dragging = false
    stateRef.current.pinchDist = 0
  }, [])

  // ── Tap to select object ──
  const handleClick = useCallback((e) => {
    const s = stateRef.current
    const w = window.innerWidth
    const h = window.innerHeight
    const cx = e.clientX
    const cy = e.clientY

    // Skip if user was dragging (compare to initial pointer-down position)
    if (Math.abs(cx - s.startX) > 8 || Math.abs(cy - s.startY) > 8) return

    // Check close button area
    if (cx < 60 && cy < 60) { onClose(); return }

    let closest = null
    let closestDist = 25 // max tap radius

    // Check planets first (higher priority)
    for (const planet of s.planetPositions) {
      if (!planet.visible) continue
      const p = project(planet.alt, planet.az, s.lookAlt, s.lookAz, s.fov, w, h)
      if (!p) continue
      const d = Math.hypot(p.x - cx, p.y - cy)
      if (d < closestDist) {
        closestDist = d
        closest = {
          name: planet.name, type: 'Planet',
          alt: planet.alt.toFixed(1), az: planet.az.toFixed(1),
          color: planet.color,
        }
      }
    }

    // Check moon
    if (s.moonPos?.visible) {
      const p = project(s.moonPos.alt, s.moonPos.az, s.lookAlt, s.lookAz, s.fov, w, h)
      if (p) {
        const d = Math.hypot(p.x - cx, p.y - cy)
        if (d < closestDist) {
          closestDist = d
          closest = {
            name: 'Moon', type: 'Moon',
            alt: s.moonPos.alt.toFixed(1), az: s.moonPos.az.toFixed(1),
            detail: `${(s.moonPos.illumination * 100).toFixed(0)}% illuminated`,
            color: '#f0e8d0',
          }
        }
      }
    }

    // Check stars
    for (const star of s.starPositions) {
      if (!star.visible) continue
      const p = project(star.alt, star.az, s.lookAlt, s.lookAz, s.fov, w, h)
      if (!p) continue
      const d = Math.hypot(p.x - cx, p.y - cy)
      if (d < closestDist) {
        closestDist = d
        const conName = CONSTELLATIONS.find(c => c.abbr === star.con)?.name || star.con
        closest = {
          name: star.name, type: 'Star',
          mag: star.mag.toFixed(2), constellation: conName,
          alt: star.alt.toFixed(1), az: star.az.toFixed(1),
          color: bvToColor(star.bv),
        }
      }
    }

    setSelected(closest)
  }, [onClose])

  const compassLabel = (az) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[Math.round(az / 45) % 8]
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black" style={{ touchAction: 'none' }}>
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

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white/80 hover:bg-white/20 transition-colors safe-top"
        style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Time + compass */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center safe-top" style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="text-white/70 text-sm font-light tabular-nums">
          {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
        <div className="text-white/40 text-[10px] tracking-wider">
          {compassLabel(compassAz)} {compassAz}°
        </div>
      </div>

      {/* Zoom hint */}
      <div className="absolute top-4 right-4 text-white/30 text-[10px] safe-top" style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}>
        Scroll to zoom
      </div>

      {/* Selected object info panel */}
      {selected && (
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 glass-card px-5 py-4 min-w-[220px] max-w-[300px] safe-bottom"
          onClick={(e) => { e.stopPropagation(); setSelected(null) }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
            <div className="text-white font-medium text-sm">{selected.name}</div>
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
            {selected.detail && <>
              <div className="text-white/40 col-span-2 mt-1">{selected.detail}</div>
            </>}
          </div>
          <div className="text-white/20 text-[9px] text-center mt-2">Tap to dismiss</div>
        </div>
      )}
    </div>
  )
}
