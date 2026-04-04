import { useState } from 'react'
import { formatDateTime } from '../timezone'

const severityColors = {
  Extreme: 'bg-red-900/40 border-red-500/60 text-red-300',
  Severe: 'bg-orange-900/30 border-orange-500/50 text-orange-300',
  Moderate: 'bg-yellow-900/30 border-yellow-500/40 text-yellow-300',
  Minor: 'bg-blue-900/30 border-blue-500/40 text-blue-300',
  Unknown: 'bg-surface border-border text-text-dim',
}

const severityEmoji = {
  Extreme: '\uD83D\uDEA8',
  Severe: '\u26A0\uFE0F',
  Moderate: '\u26A0\uFE0F',
  Minor: '\u2139\uFE0F',
}

export default function WeatherAlerts({ alerts }) {
  const [expanded, setExpanded] = useState(null)

  if (!alerts?.length) return null

  // Sort by severity
  const order = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 }
  const sorted = [...alerts].sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4))

  return (
    <section className="mt-4 mb-6 space-y-2">
      {sorted.map((alert, i) => {
        const colors = severityColors[alert.severity] || severityColors.Unknown
        const isOpen = expanded === i
        return (
          <div key={i} className={`rounded-xl border ${colors} overflow-hidden`}>
            <button
              className="w-full px-4 py-3 flex items-start gap-2 text-left"
              onClick={() => setExpanded(isOpen ? null : i)}
            >
              <span className="text-lg flex-shrink-0 mt-0.5">
                {severityEmoji[alert.severity] || '\u26A0\uFE0F'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{alert.event}</div>
                {alert.headline && (
                  <div className="text-xs opacity-80 mt-0.5 line-clamp-2">{alert.headline}</div>
                )}
              </div>
              <svg
                viewBox="0 0 24 24"
                className={`w-5 h-5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 text-xs opacity-90 space-y-2">
                {alert.description && (
                  <p className="whitespace-pre-line leading-relaxed">{alert.description}</p>
                )}
                {alert.instruction && (
                  <div className="mt-2 pt-2 border-t border-current/20">
                    <span className="font-semibold">Action: </span>
                    <span>{alert.instruction}</span>
                  </div>
                )}
                {alert.expires && (
                  <p className="text-[10px] opacity-60">
                    Expires: {formatDateTime(new Date(alert.expires))}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
