import { useState, useEffect } from 'react'
import { getPollenForecast } from '../api'

function pollenLevel(value) {
  if (value == null || value <= 0) return { label: 'None', color: '#555570' }
  if (value <= 20) return { label: 'Low', color: '#22c55e' }
  if (value <= 80) return { label: 'Moderate', color: '#eab308' }
  if (value <= 200) return { label: 'High', color: '#f97316' }
  return { label: 'Very High', color: '#ef4444' }
}

const POLLEN_TYPES = [
  { key: 'grass', label: 'Grass', icon: '🌿' },
  { key: 'ragweed', label: 'Ragweed', icon: '🌾' },
  { key: 'birch', label: 'Birch', icon: '🌳' },
  { key: 'alder', label: 'Alder', icon: '🌲' },
  { key: 'mugwort', label: 'Mugwort', icon: '🪴' },
  { key: 'olive', label: 'Olive', icon: '🫒' },
]

export default function PollenForecast({ lat, lon }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPollenForecast(lat, lon)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [lat, lon])

  if (loading || !data) return null

  const active = POLLEN_TYPES.filter(t => data[t.key] != null && data[t.key] > 0)
  if (!active.length) return null

  const overall = Math.max(...POLLEN_TYPES.map(t => data[t.key] || 0))
  const overallLevel = pollenLevel(overall)

  return (
    <section className="mb-6">
      <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3 px-1">Pollen & Allergies</h2>
      <div className="glass-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">{"🤧"}</span>
          <div>
            <div className="text-sm font-medium" style={{ color: overallLevel.color }}>{overallLevel.label}</div>
            <div className="text-text-muted text-xs">
              {overallLevel.label === 'None' ? 'No significant pollen detected' :
               overallLevel.label === 'Low' ? 'Good day for allergy sufferers' :
               overallLevel.label === 'Moderate' ? 'Sensitive individuals may notice symptoms' :
               'Consider antihistamines if you have allergies'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {POLLEN_TYPES.map(t => {
            const val = data[t.key] || 0
            const level = pollenLevel(val)
            return (
              <div key={t.key} className="bg-white/[0.03] rounded-lg p-2 text-center border border-white/[0.03]">
                <div className="text-sm mb-0.5">{t.icon}</div>
                <div className="text-text-muted text-[10px]">{t.label}</div>
                <div className="text-xs font-medium" style={{ color: level.color }}>{level.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
