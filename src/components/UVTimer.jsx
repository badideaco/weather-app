import { useState, useEffect } from 'react'

// Approximate minutes to sunburn by UV index and skin type
// Skin types: 1=very fair, 2=fair, 3=medium, 4=olive, 5=brown, 6=dark
const BURN_MINUTES = {
  1: [67, 100, 200, 400, 600, 1000],
  2: [50, 75, 150, 300, 500, 800],
  3: [33, 50, 100, 200, 300, 600],
  4: [25, 40, 80, 150, 250, 500],
  5: [20, 33, 67, 130, 200, 400],
  6: [17, 25, 50, 100, 170, 330],
  7: [14, 22, 44, 90, 145, 285],
  8: [12, 20, 38, 75, 125, 250],
  9: [11, 17, 33, 67, 110, 220],
  10: [10, 15, 30, 60, 100, 200],
  11: [8, 13, 27, 55, 90, 180],
}

function uvColor(uv) {
  if (uv >= 11) return '#8b5cf6'  // extreme - violet
  if (uv >= 8) return '#ef4444'   // very high - red
  if (uv >= 6) return '#f97316'   // high - orange
  if (uv >= 3) return '#eab308'   // moderate - yellow
  return '#22c55e'                 // low - green
}

function uvLabel(uv) {
  if (uv >= 11) return 'Extreme'
  if (uv >= 8) return 'Very High'
  if (uv >= 6) return 'High'
  if (uv >= 3) return 'Moderate'
  return 'Low'
}

const SKIN_LABELS = ['Very Fair', 'Fair', 'Medium', 'Olive', 'Brown', 'Dark']

export default function UVTimer({ uvIndex }) {
  const [skinType, setSkinType] = useState(() => {
    return parseInt(localStorage.getItem('stormscope-skin') || '2')
  })
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    localStorage.setItem('stormscope-skin', String(skinType))
  }, [skinType])

  if (uvIndex == null || uvIndex < 1) return null

  const uv = Math.round(uvIndex)
  const burnRow = BURN_MINUTES[Math.min(uv, 11)] || BURN_MINUTES[11]
  const burnMinutes = burnRow[skinType]
  const color = uvColor(uv)

  return (
    <div className="bg-surface/60 rounded-2xl border border-border/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-text-dim text-xs font-semibold uppercase tracking-wider">UV Index</h3>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="text-text-muted text-[10px] hover:text-text-dim transition-colors"
        >
          Skin: {SKIN_LABELS[skinType]}
        </button>
      </div>

      {showPicker && (
        <div className="flex gap-1 mb-3">
          {SKIN_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => { setSkinType(i); setShowPicker(false) }}
              className={`flex-1 py-1.5 rounded-lg text-[10px] transition-colors ${
                skinType === i ? 'bg-accent/20 text-accent' : 'bg-surface-light/50 text-text-muted'
              }`}
            >{label}</button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4">
        {/* UV gauge */}
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg viewBox="0 0 80 80" className="w-full h-full">
            <circle cx="40" cy="40" r="32" fill="none" stroke="#2a2a4a" strokeWidth="6" />
            <circle
              cx="40" cy="40" r="32" fill="none"
              stroke={color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${(Math.min(uv, 11) / 11) * 201} 201`}
              transform="rotate(-90 40 40)"
            />
            <text x="40" y="37" textAnchor="middle" fill={color} fontSize="20" fontWeight="700">{uv}</text>
            <text x="40" y="52" textAnchor="middle" fill="#8888a8" fontSize="8">{uvLabel(uv)}</text>
          </svg>
        </div>

        {/* Burn timer */}
        <div className="flex-1">
          <div className="text-text text-sm">
            <span className="font-medium" style={{ color }}>~{burnMinutes} min</span>
            <span className="text-text-dim"> to sunburn</span>
          </div>
          <div className="text-text-muted text-xs mt-1">
            {uv >= 6 ? 'Seek shade, wear sunscreen SPF 30+' :
             uv >= 3 ? 'Sunscreen recommended for extended time outside' :
             'Minimal protection needed'}
          </div>
          {/* UV scale bar */}
          <div className="flex gap-0.5 mt-2">
            {Array.from({ length: 11 }, (_, i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{
                  backgroundColor: i < uv ? uvColor(i + 1) : '#2a2a4a',
                  opacity: i < uv ? 1 : 0.3,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
