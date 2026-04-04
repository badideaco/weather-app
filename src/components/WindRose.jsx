export default function WindRose({ direction, speed, gust }) {
  if (direction == null && speed == null) return null

  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const arrowRotation = direction ?? 0

  return (
    <div className="bg-surface/60 rounded-2xl border border-border/40 p-4">
      <h3 className="text-text-dim text-xs font-semibold uppercase tracking-wider mb-3">Wind</h3>
      <div className="flex items-center gap-6">
        {/* Compass */}
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full">
            {/* Compass ring */}
            <circle cx="60" cy="60" r="54" fill="none" stroke="#2a2a4a" strokeWidth="1" />
            <circle cx="60" cy="60" r="40" fill="none" stroke="#2a2a4a" strokeWidth="0.5" strokeDasharray="2 4" />
            {/* Cardinal directions */}
            {dirs.map((d, i) => {
              const angle = (i * 45 - 90) * (Math.PI / 180)
              const x = 60 + Math.cos(angle) * 50
              const y = 60 + Math.sin(angle) * 50
              const isCardinal = i % 2 === 0
              return (
                <text
                  key={d} x={x} y={y}
                  textAnchor="middle" dominantBaseline="central"
                  fill={isCardinal ? '#8888a8' : '#555570'}
                  fontSize={isCardinal ? 10 : 7}
                  fontWeight={isCardinal ? 600 : 400}
                >{d}</text>
              )
            })}
            {/* Wind arrow */}
            {direction != null && (
              <g transform={`rotate(${arrowRotation}, 60, 60)`}>
                {/* Arrow pointing from direction wind comes FROM */}
                <line x1="60" y1="22" x2="60" y2="75" stroke="#4fc3f7" strokeWidth="2.5" strokeLinecap="round" />
                <polygon points="60,22 53,36 67,36" fill="#4fc3f7" />
                {/* Tail */}
                <line x1="55" y1="70" x2="60" y2="75" stroke="#4fc3f7" strokeWidth="2" strokeLinecap="round" />
                <line x1="65" y1="70" x2="60" y2="75" stroke="#4fc3f7" strokeWidth="2" strokeLinecap="round" />
              </g>
            )}
            {/* Center dot */}
            <circle cx="60" cy="60" r="3" fill="#4fc3f7" opacity="0.6" />
          </svg>
        </div>

        {/* Wind details */}
        <div className="flex-1 space-y-2">
          <div>
            <div className="text-3xl font-light text-text">
              {speed ?? '--'} <span className="text-lg text-text-dim">mph</span>
            </div>
          </div>
          {gust != null && gust > 0 && (
            <div className="text-text-dim text-sm">
              Gusts to <span className="text-accent-warm font-medium">{gust} mph</span>
            </div>
          )}
          {direction != null && (
            <div className="text-text-muted text-xs">
              From {dirs[Math.round(direction / 45) % 8]} ({Math.round(direction)}°)
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
