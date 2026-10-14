import { TileLayer, AttributionControl } from 'react-leaflet'

// ── Shared dark basemap: base layer + labels drawn above data overlays ──
// Esri Dark Gray Canvas, no API key. CARTO's dark_nolabels/dark_only_labels
// (used until Oct 2026) started returning "API KEY REQUIRED" watermark tiles
// with HTTP 200, so nothing errored. Esri URLs are {z}/{y}/{x} (row before
// column). Esri sends Access-Control-Allow-Origin: *, so crossOrigin makes the
// service worker cache real 200 responses instead of quota-padded opaque ones.
// src/sw.js caches this host (rule "basemap-tiles"); change both together.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas'
const ATTRIBUTION = 'Esri, HERE, Garmin, &copy; OpenStreetMap'

export default function DarkBasemap() {
  return (
    <>
      <TileLayer
        url={`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`}
        attribution={ATTRIBUTION}
        maxNativeZoom={16}
        crossOrigin
        className="basemap-base"
      />
      <TileLayer
        url={`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`}
        maxNativeZoom={16}
        crossOrigin
        zIndex={20}
      />
      <AttributionControl position="bottomright" prefix={false} />
    </>
  )
}
