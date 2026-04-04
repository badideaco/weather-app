import { useState, useEffect } from 'react'

function aqiColor(aqi) {
  if (aqi <= 50) return '#22c55e'   // Good
  if (aqi <= 100) return '#eab308'  // Moderate
  if (aqi <= 150) return '#f97316'  // Unhealthy for sensitive
  if (aqi <= 200) return '#ef4444'  // Unhealthy
  if (aqi <= 300) return '#8b5cf6'  // Very unhealthy
  return '#7f1d1d'                  // Hazardous
}

function aqiLabel(aqi) {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

function aqiAdvice(aqi) {
  if (aqi <= 50) return 'Air quality is great. Enjoy outdoor activities!'
  if (aqi <= 100) return 'Acceptable. Unusually sensitive people should limit prolonged outdoor exertion.'
  if (aqi <= 150) return 'Sensitive groups should reduce prolonged outdoor exertion.'
  if (aqi <= 200) return 'Everyone should reduce prolonged outdoor exertion.'
  return 'Everyone should avoid outdoor exertion. Stay indoors.'
}

function PollutantBar({ label, value, unit, max }) {
  if (value == null) return null
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted text-[10px] w-10">{label}</span>
      <div className="flex-1 h-1 bg-white/[0.04] rounded-full">
        <div className="h-full rounded-full bg-accent/80" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-text-dim text-[10px] w-12 text-right">{value.toFixed(1)} {unit}</span>
    </div>
  )
}

export default function AirQuality({ lat, lon }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone&timezone=auto`)
      .then(r => r.json())
      .then(d => { setData(d.current); setLoading(false) })
      .catch(() => setLoading(false))
  }, [lat, lon])

  if (loading) return (
    <section className="mb-6">
      <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3 px-1">Air Quality</h2>
      <div className="skeleton h-32 rounded-2xl" />
    </section>
  )

  if (!data) return null

  const aqi = data.us_aqi
  const color = aqiColor(aqi)

  return (
    <section className="mb-6">
      <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3 px-1">Air Quality</h2>
      <div className="glass-card p-4">
        <div className="flex items-center gap-4 mb-3">
          {/* AQI gauge */}
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg viewBox="0 0 80 80" className="w-full h-full">
              <defs>
                <filter id="aqiGlow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="32" fill="none"
                stroke={color} strokeWidth="6" strokeLinecap="round" filter="url(#aqiGlow)"
                strokeDasharray={`${(Math.min(aqi, 300) / 300) * 201} 201`}
                transform="rotate(-90 40 40)"
              />
              <text x="40" y="37" textAnchor="middle" fill={color} fontSize="18" fontWeight="700">{aqi}</text>
              <text x="40" y="52" textAnchor="middle" fill="#8888a8" fontSize="7">US AQI</text>
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium" style={{ color }}>{aqiLabel(aqi)}</div>
            <div className="text-text-muted text-xs mt-0.5">{aqiAdvice(aqi)}</div>
          </div>
        </div>

        {/* Pollutant breakdown */}
        <div className="space-y-1.5 pt-3 border-t border-white/[0.04]">
          <PollutantBar label="PM2.5" value={data.pm2_5} unit="µg/m³" max={75} />
          <PollutantBar label="PM10" value={data.pm10} unit="µg/m³" max={150} />
          <PollutantBar label="O₃" value={data.ozone} unit="µg/m³" max={200} />
          <PollutantBar label="NO₂" value={data.nitrogen_dioxide} unit="µg/m³" max={100} />
          <PollutantBar label="CO" value={data.carbon_monoxide} unit="µg/m³" max={1000} />
        </div>
      </div>
    </section>
  )
}
