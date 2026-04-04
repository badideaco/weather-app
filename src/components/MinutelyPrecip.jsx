import { useState, useEffect } from 'react'
import { getMinutelyPrecip } from '../api'

export default function MinutelyPrecip({ lat, lon }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMinutelyPrecip(lat, lon)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [lat, lon])

  if (loading || !data?.length) return null

  // Find next rain start/stop
  const now = new Date()
  const upcoming = data.filter(d => new Date(d.time) >= now).slice(0, 24) // Next 6 hours (15-min intervals)
  if (!upcoming.length) return null

  const isRaining = upcoming[0]?.precip > 0
  let changeIdx = upcoming.findIndex((d, i) => i > 0 && (d.precip > 0) !== (upcoming[0].precip > 0))
  const changeMinutes = changeIdx > 0 ? changeIdx * 15 : null

  const maxPrecip = Math.max(...upcoming.map(d => d.precip), 0.5)
  const hasAnyPrecip = upcoming.some(d => d.precip > 0)

  if (!hasAnyPrecip && !isRaining) return null // No precipitation expected

  // Determine status message
  let statusMsg = ''
  let statusColor = 'text-accent'
  if (isRaining && changeMinutes) {
    statusMsg = `Rain stopping in ~${changeMinutes} min`
    statusColor = 'text-green-400'
  } else if (isRaining) {
    statusMsg = 'Rain continuing for the next few hours'
    statusColor = 'text-accent'
  } else if (changeMinutes) {
    statusMsg = `Rain starting in ~${changeMinutes} min`
    statusColor = 'text-yellow-400'
  }

  return (
    <section className="mb-6">
      <div className="bg-surface/60 rounded-2xl border border-border/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{"🌧️"}</span>
            <h3 className="text-text-dim text-xs font-semibold uppercase tracking-wider">Next Hour Precipitation</h3>
          </div>
          {statusMsg && <span className={`text-xs font-medium ${statusColor}`}>{statusMsg}</span>}
        </div>

        {/* Precipitation bar chart */}
        <div className="flex items-end gap-[2px] h-16">
          {upcoming.slice(0, 16).map((d, i) => {
            const height = Math.max(1, (d.precip / maxPrecip) * 100)
            const intensity = d.precip > 2 ? 'bg-blue-400' : d.precip > 0.5 ? 'bg-accent' : d.precip > 0 ? 'bg-accent/60' : 'bg-border/30'
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                <div
                  className={`w-full rounded-t ${intensity} transition-all`}
                  style={{ height: `${d.precip > 0 ? height : 5}%`, minHeight: 2 }}
                />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-text-muted text-[10px]">Now</span>
          <span className="text-text-muted text-[10px]">+1hr</span>
          <span className="text-text-muted text-[10px]">+2hr</span>
          <span className="text-text-muted text-[10px]">+3hr</span>
          <span className="text-text-muted text-[10px]">+4hr</span>
        </div>
      </div>
    </section>
  )
}
