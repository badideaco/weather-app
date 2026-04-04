import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts'
import { getSpaceWeather } from '../api'

function kpColor(kp) {
  if (kp >= 7) return '#ef5350'
  if (kp >= 5) return '#ff9800'
  if (kp >= 4) return '#ffeb3b'
  return '#66bb6a'
}

function kpLabel(kp) {
  if (kp >= 8) return 'Severe Storm'
  if (kp >= 7) return 'Strong Storm'
  if (kp >= 6) return 'Moderate Storm'
  if (kp >= 5) return 'Minor Storm'
  if (kp >= 4) return 'Active'
  if (kp >= 2) return 'Quiet'
  return 'Very Quiet'
}

function scaleColor(level) {
  const n = parseInt(level) || 0
  if (n >= 4) return 'text-red-400'
  if (n >= 3) return 'text-orange-400'
  if (n >= 2) return 'text-yellow-400'
  if (n >= 1) return 'text-amber-300'
  return 'text-green-400'
}

function ScaleCard({ label, icon, scale }) {
  const level = scale?.Scale || '0'
  const text = scale?.Text || 'None'
  return (
    <div className="bg-white/[0.03] rounded-xl p-3 text-center border border-white/[0.03]">
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-text-muted text-[10px] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-bold ${scaleColor(level)}`}>
        {parseInt(level) > 0 ? `${label.charAt(0)}${level}` : 'None'}
      </div>
      <div className="text-text-dim text-[10px] mt-0.5">{text}</div>
    </div>
  )
}

export default function SpaceWeather() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showChart, setShowChart] = useState(false)

  useEffect(() => {
    getSpaceWeather()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <section className="mb-6">
        <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3 px-1">Space Weather</h2>
        <div className="skeleton h-48 rounded-2xl" />
      </section>
    )
  }

  if (!data) return null

  const kpChartData = data.kpHistory.map(h => ({
    time: new Date(h.time).toLocaleTimeString('en-US', { hour: 'numeric', timeZone: 'America/Chicago' }),
    kp: h.kp,
  }))

  return (
    <section className="mb-6">
      <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3 px-1">Space Weather</h2>
      <div className="glass-card p-4 space-y-4">
        {/* Kp Index Hero */}
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <defs>
                <filter id="kpGlow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="40" fill="none"
                stroke={kpColor(data.kp)}
                strokeWidth="8"
                strokeLinecap="round" filter="url(#kpGlow)"
                strokeDasharray={`${(data.kp / 9) * 251.3} 251.3`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold" style={{ color: kpColor(data.kp) }}>
                {data.kp.toFixed(0)}
              </span>
            </div>
          </div>
          <div>
            <div className="text-text font-semibold">Kp Index</div>
            <div className="text-sm" style={{ color: kpColor(data.kp) }}>{kpLabel(data.kp)}</div>
            <div className="text-text-muted text-xs mt-1">
              Solar Wind: {Math.round(data.solarWindSpeed)} km/s
            </div>
            <div className="text-text-muted text-xs">
              Density: {data.solarWindDensity.toFixed(1)} p/cm³
            </div>
          </div>
        </div>

        {/* NOAA Scales */}
        <div className="grid grid-cols-3 gap-2">
          <ScaleCard label="Geomagnetic" icon="🧲" scale={data.geoStorm} />
          <ScaleCard label="Solar Rad" icon="☢️" scale={data.solarRadiation} />
          <ScaleCard label="Radio" icon="📡" scale={data.radioBlackout} />
        </div>

        {/* Kp Chart Toggle */}
        <button
          onClick={() => setShowChart(!showChart)}
          className="text-accent text-xs flex items-center gap-1"
        >
          {showChart ? 'Hide' : 'Show'} Kp History
          <svg viewBox="0 0 24 24" className={`w-3 h-3 transition-transform ${showChart ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {showChart && kpChartData.length > 0 && (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={kpChartData}>
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#555570', fontSize: 10 }}
                  axisLine={{ stroke: '#2a2a4a' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 9]}
                  tick={{ fill: '#555570', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={20}
                />
                <ReferenceLine y={5} stroke="#ff9800" strokeDasharray="3 3" strokeOpacity={0.5} />
                <Line
                  type="monotone"
                  dataKey="kp"
                  stroke="#4fc3f7"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Aurora visibility hint */}
        {data.kp >= 5 && (
          <div className="bg-green-900/20 border border-green-500/30 rounded-xl px-3 py-2 text-green-300 text-xs">
            Aurora may be visible at mid-latitudes! Look north after dark.
          </div>
        )}
      </div>
    </section>
  )
}
