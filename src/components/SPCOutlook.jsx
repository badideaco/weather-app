import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip } from 'react-leaflet'
import { getSPCOutlook } from '../api'
import 'leaflet/dist/leaflet.css'

const RISK_INFO = {
  'TSTM': { label: 'Thunderstorms', color: '#88cc88', level: 0 },
  'MRGL': { label: 'Marginal Risk', color: '#66c266', level: 1 },
  'SLGT': { label: 'Slight Risk', color: '#f0e040', level: 2 },
  'ENH':  { label: 'Enhanced Risk', color: '#e89040', level: 3 },
  'MDT':  { label: 'Moderate Risk', color: '#e06060', level: 4 },
  'HIGH': { label: 'High Risk', color: '#ff60ff', level: 5 },
}

function riskFromLabel(label) {
  const upper = (label || '').toUpperCase().trim()
  for (const [key, val] of Object.entries(RISK_INFO)) {
    if (upper.includes(key)) return { key, ...val }
  }
  return { key: upper, label: label, color: '#888888', level: 0 }
}

export default function SPCOutlook({ lat, lon }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSPCOutlook()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <section className="mb-6">
      <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3 px-1">Severe Weather Outlook</h2>
      <div className="skeleton h-48 rounded-2xl" />
    </section>
  )

  if (!data?.length) return null

  // Determine local risk level
  const risks = data.map(d => riskFromLabel(d.risk)).filter(r => r.level > 0)
  const maxRisk = risks.length > 0 ? risks.reduce((a, b) => a.level > b.level ? a : b) : null

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em]">Severe Weather Outlook</h2>
        <span className="text-text-muted text-xs">SPC Day 1</span>
      </div>
      <div className="glass-card overflow-hidden">
        {/* Risk legend */}
        {maxRisk && (
          <div className="px-4 py-2 border-b border-white/[0.04] flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: maxRisk.color }} />
            <span className="text-text text-sm font-medium">{maxRisk.label}</span>
            <span className="text-text-muted text-xs">in your area</span>
          </div>
        )}

        <div className="h-[280px]">
          <MapContainer
            center={[39, -96]}
            zoom={5}
            maxZoom={10}
            bounceAtZoomLimits={false}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png" subdomains="abcd" zIndex={20} />
            {data.map((area, i) => {
              const risk = riskFromLabel(area.risk)
              if (area.polygon.length < 3) return null
              return (
                <Polygon key={i}
                  positions={area.polygon}
                  pathOptions={{ color: area.stroke || risk.color, fillColor: area.fill || risk.color, fillOpacity: 0.25, weight: 1.5 }}
                >
                  <Tooltip sticky><span style={{ color: '#e8e8ec', fontSize: 12 }}>{risk.label}</span></Tooltip>
                </Polygon>
              )
            })}
            <CircleMarker center={[lat, lon]} radius={5} pathOptions={{ color: '#4fc3f7', fillColor: '#4fc3f7', fillOpacity: 0.9, weight: 2 }} />
          </MapContainer>
        </div>

        {/* Risk scale */}
        <div className="px-4 py-2 flex gap-1 border-t border-border/30">
          {['MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'].map(key => (
            <div key={key} className="flex-1 text-center">
              <div className="h-1.5 rounded-full mb-1" style={{ backgroundColor: RISK_INFO[key].color, opacity: 0.7 }} />
              <span className="text-[8px] text-text-muted">{RISK_INFO[key].label.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
