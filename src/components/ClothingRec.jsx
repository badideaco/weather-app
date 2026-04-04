function getRecommendations(temp, wind, humidity, conditions, uvIndex) {
  const recs = []
  const desc = (conditions || '').toLowerCase()
  const feelsLike = temp != null && wind != null
    ? Math.round(temp - (wind > 5 ? (wind * 0.7) : 0))
    : temp

  // Temperature-based
  if (feelsLike != null) {
    if (feelsLike <= 20) {
      recs.push({ icon: '🧥', text: 'Heavy winter coat, layers, gloves, hat' })
    } else if (feelsLike <= 32) {
      recs.push({ icon: '🧥', text: 'Winter coat, warm layers, gloves' })
    } else if (feelsLike <= 45) {
      recs.push({ icon: '🧥', text: 'Heavy jacket, consider layering' })
    } else if (feelsLike <= 55) {
      recs.push({ icon: '🧶', text: 'Light jacket or sweater' })
    } else if (feelsLike <= 65) {
      recs.push({ icon: '👕', text: 'Long sleeves or light layer' })
    } else if (feelsLike <= 80) {
      recs.push({ icon: '👕', text: 'T-shirt weather, comfortable' })
    } else if (feelsLike <= 90) {
      recs.push({ icon: '🩳', text: 'Shorts and light clothing, stay hydrated' })
    } else {
      recs.push({ icon: '🥵', text: 'Minimal clothing, stay in shade, drink water' })
    }
  }

  // Rain/precipitation
  if (desc.includes('rain') || desc.includes('shower') || desc.includes('drizzle') || desc.includes('storm')) {
    recs.push({ icon: '☂️', text: 'Bring an umbrella or rain jacket' })
  }
  if (desc.includes('snow') || desc.includes('sleet') || desc.includes('ice')) {
    recs.push({ icon: '🥾', text: 'Waterproof boots, watch for ice' })
  }

  // Wind
  if (wind != null && wind >= 20) {
    recs.push({ icon: '💨', text: 'Secure loose items, brace for strong wind' })
  } else if (wind != null && wind >= 15) {
    recs.push({ icon: '🌬️', text: 'Windy — layer up, windbreaker helps' })
  }

  // UV
  if (uvIndex != null && uvIndex >= 6) {
    recs.push({ icon: '🧴', text: 'Sunscreen, hat, and sunglasses essential' })
  } else if (uvIndex != null && uvIndex >= 3) {
    recs.push({ icon: '🕶️', text: 'Sunglasses recommended' })
  }

  // Humidity
  if (humidity != null && humidity >= 80 && feelsLike >= 75) {
    recs.push({ icon: '💧', text: 'Very humid — moisture-wicking fabrics' })
  }

  // Fog
  if (desc.includes('fog') || desc.includes('haze')) {
    recs.push({ icon: '🔦', text: 'Low visibility — use headlights, be cautious' })
  }

  return recs.slice(0, 4) // Max 4 recommendations
}

export default function ClothingRec({ temp, wind, humidity, conditions, uvIndex }) {
  const recs = getRecommendations(temp, wind, humidity, conditions, uvIndex)

  if (!recs.length) return null

  return (
    <div className="glass-card p-4">
      <h3 className="text-text-muted text-[11px] font-medium uppercase tracking-[0.08em] mb-3">What to Wear</h3>
      <div className="space-y-2">
        {recs.map((rec, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-lg flex-shrink-0">{rec.icon}</span>
            <span className="text-text text-sm">{rec.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
