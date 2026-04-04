import { useState, useRef, useEffect } from 'react'

const LOCATIONS_KEY = 'stormscope-locations'

function getSavedLocations() {
  try { return JSON.parse(localStorage.getItem(LOCATIONS_KEY) || '[]') }
  catch { return [] }
}

export default function LocationManager({ currentLocation, locationName, onSelect, onRelocate }) {
  const [open, setOpen] = useState(false)
  const [locations, setLocations] = useState(getSavedLocations)
  const [addMode, setAddMode] = useState(false)
  const [zipInput, setZipInput] = useState('')
  const [addError, setAddError] = useState(null)
  const panelRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Save current location if not already saved
  useEffect(() => {
    if (!currentLocation || !locationName) return
    const existing = getSavedLocations()
    const alreadySaved = existing.some(l =>
      Math.abs(l.lat - currentLocation.lat) < 0.01 && Math.abs(l.lon - currentLocation.lon) < 0.01
    )
    if (!alreadySaved && existing.length === 0) {
      const updated = [{ ...currentLocation, name: locationName }]
      localStorage.setItem(LOCATIONS_KEY, JSON.stringify(updated))
      setLocations(updated)
    }
  }, [currentLocation, locationName])

  const saveCurrentLocation = () => {
    if (!currentLocation || !locationName) return
    const existing = getSavedLocations()
    const alreadySaved = existing.some(l =>
      Math.abs(l.lat - currentLocation.lat) < 0.01 && Math.abs(l.lon - currentLocation.lon) < 0.01
    )
    if (!alreadySaved) {
      const updated = [...existing, { ...currentLocation, name: locationName }]
      localStorage.setItem(LOCATIONS_KEY, JSON.stringify(updated))
      setLocations(updated)
    }
  }

  const removeLocation = (idx) => {
    const updated = locations.filter((_, i) => i !== idx)
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(updated))
    setLocations(updated)
  }

  const addByZip = async () => {
    if (!zipInput.trim()) return
    setAddError(null)
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zipInput.trim()}`)
      if (!res.ok) throw new Error('Invalid ZIP')
      const data = await res.json()
      const place = data.places[0]
      const loc = {
        lat: parseFloat(place.latitude),
        lon: parseFloat(place.longitude),
        name: `${place['place name']}, ${place['state abbreviation']}`,
      }
      const existing = getSavedLocations()
      const updated = [...existing, loc]
      localStorage.setItem(LOCATIONS_KEY, JSON.stringify(updated))
      setLocations(updated)
      setZipInput('')
      setAddMode(false)
    } catch {
      setAddError('Invalid ZIP code')
    }
  }

  const isCurrentLocation = (loc) =>
    currentLocation &&
    Math.abs(loc.lat - currentLocation.lat) < 0.01 &&
    Math.abs(loc.lon - currentLocation.lon) < 0.01

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 min-w-0"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-accent flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        <span className="text-text font-semibold truncate text-left">
          {locationName || 'Loading...'}
        </span>
        <svg viewBox="0 0 24 24" className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-surface border border-border rounded-xl shadow-xl z-[100] overflow-hidden">
          {/* Saved locations */}
          <div className="max-h-64 overflow-y-auto">
            {locations.map((loc, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-surface-light/50 transition-colors ${
                  isCurrentLocation(loc) ? 'bg-accent/10' : ''
                }`}
              >
                <button
                  className="flex-1 text-left text-sm text-text truncate"
                  onClick={() => { onSelect(loc); setOpen(false) }}
                >
                  {isCurrentLocation(loc) && <span className="text-accent mr-1.5">●</span>}
                  {loc.name}
                </button>
                {!isCurrentLocation(loc) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeLocation(i) }}
                    className="text-text-muted hover:text-danger text-xs p-1"
                  >✕</button>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="border-t border-border/50 p-2 space-y-1">
            {currentLocation && !locations.some(l => isCurrentLocation(l)) && (
              <button
                onClick={saveCurrentLocation}
                className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-surface-light/50 rounded-lg transition-colors"
              >+ Save current location</button>
            )}

            {addMode ? (
              <div className="flex gap-1 px-1">
                <input
                  type="text" inputMode="numeric" maxLength={5}
                  value={zipInput}
                  onChange={e => setZipInput(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && addByZip()}
                  placeholder="ZIP Code"
                  className="flex-1 bg-bg border border-border rounded-lg px-3 py-1.5 text-text text-sm outline-none focus:border-accent"
                  autoFocus
                />
                <button onClick={addByZip} className="bg-accent text-bg text-sm font-medium px-3 py-1.5 rounded-lg">Add</button>
                <button onClick={() => { setAddMode(false); setAddError(null) }} className="text-text-muted text-sm px-2">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setAddMode(true)}
                className="w-full text-left px-3 py-2 text-sm text-text-dim hover:bg-surface-light/50 rounded-lg transition-colors"
              >+ Add location by ZIP</button>
            )}
            {addError && <p className="text-danger text-xs px-3">{addError}</p>}

            <button
              onClick={() => { onRelocate(); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-text-dim hover:bg-surface-light/50 rounded-lg transition-colors"
            >Use current GPS location</button>
          </div>
        </div>
      )}
    </div>
  )
}
