import { useMemo } from 'react'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts'

import { getHourLabel } from '../timezone'

export default function ForecastCharts({ hourly }) {
  if (!hourly?.length) return null

  const chartData = useMemo(() =>
    hourly.slice(0, 48).map(p => ({
      time: getHourLabel(p.startTime),
      precip: p.probabilityOfPrecipitation?.value ?? 0,
      wind: parseInt(p.windSpeed) || 0,
      temp: p.temperature,
    })),
    [hourly]
  )

  const totalPrecipChance = chartData.reduce((sum, d) => sum + d.precip, 0) / chartData.length
  const maxWind = Math.max(...chartData.map(d => d.wind))
  // Round up to nearest 5 for a clean Y-axis
  const windCeil = Math.ceil(maxWind / 5) * 5 || 10

  return (
    <section className="mb-6 space-y-4">
      {/* Precipitation Probability */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em]">48-Hour Precipitation Chance</h2>
          <span className="text-text-muted text-xs">Avg {Math.round(totalPrecipChance)}%</span>
        </div>
        <div className="glass-card p-4">
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="precipGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4fc3f7" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#4fc3f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time" tick={{ fill: '#555570', fontSize: 10 }}
                  axisLine={false} tickLine={false} interval={5}
                />
                <YAxis domain={[0, 100]} hide />
                <ReferenceLine y={50} stroke="#2a2a4a" strokeDasharray="3 3" />
                <Area
                  type="monotone" dataKey="precip" stroke="#4fc3f7"
                  strokeWidth={2} fill="url(#precipGrad)" dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Wind Speed Timeline */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em]">48-Hour Wind Speed</h2>
          <span className="text-text-muted text-xs">Peak {maxWind} mph</span>
        </div>
        <div className="glass-card p-4">
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="time" tick={{ fill: '#555570', fontSize: 10 }}
                  axisLine={false} tickLine={false} interval={5}
                />
                <YAxis
                  domain={[0, windCeil]}
                  tick={{ fill: '#555570', fontSize: 9 }}
                  axisLine={false} tickLine={false}
                  width={30}
                  tickFormatter={v => `${v}`}
                />
                <ReferenceLine y={15} stroke="#ff9800" strokeDasharray="3 3" strokeOpacity={0.3} />
                <Line
                  type="monotone" dataKey="wind" stroke="#66bb6a"
                  strokeWidth={2} dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  )
}
