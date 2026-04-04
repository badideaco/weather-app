# StormScope Weather App

## Overview
A Progressive Web App (PWA) weather dashboard with radar, space weather, astronomy, and flight tracking. No login required - shareable URL for friends and family.

## Tech Stack
- **Frontend**: React 19, Vite, Tailwind CSS v4
- **Maps**: Leaflet + react-leaflet
- **Charts**: Recharts
- **Astronomy**: SunCalc
- **PWA**: vite-plugin-pwa (Workbox)
- **Deployment**: AWS Amplify (static SPA)

## Data Sources (all free, no API keys)
| Source | API | Data |
|--------|-----|------|
| NWS | api.weather.gov | Current conditions, hourly/daily forecast, alerts |
| RainViewer | api.rainviewer.com | Animated radar tiles |
| NOAA SWPC | services.swpc.noaa.gov | Kp index, solar wind, NOAA scales |
| OpenSky | opensky-network.org | Live flight tracking |
| NASA | api.nasa.gov (DEMO_KEY) | Astronomy Picture of the Day |
| Where's ISS | api.wheretheiss.at | ISS position |
| Zippopotam | api.zippopotam.us | ZIP code geocoding |

## Build & Dev
```bash
npm install
npm run dev     # Start dev server
npm run build   # Production build → dist/
npm run preview # Preview production build
```

## Architecture
- **No backend** - all API calls are client-side
- **Geolocation** with ZIP code fallback (saved to localStorage)
- **Progressive loading** - weather data fetched in parallel, sections render as data arrives
- **Lazy flight tracking** - only fetches when section scrolls into view (IntersectionObserver)
- **Service worker** - caches map tiles, API responses for offline resilience

## Deployment
- git push to `main` → Amplify auto-build
- Amplify platform: `WEB` (static SPA, NOT `WEB_COMPUTE`)
- Build output: `dist/`

## Key Files
| File | Purpose |
|------|---------|
| `src/App.jsx` | Main app, location/weather state management |
| `src/api.js` | All API functions + unit conversions |
| `src/components/CurrentWeather.jsx` | Hero temp display + detail grid |
| `src/components/HourlyForecast.jsx` | 24-hour horizontal scroll |
| `src/components/DailyForecast.jsx` | 7-day forecast with temp bars |
| `src/components/RadarMap.jsx` | Leaflet map + RainViewer radar animation |
| `src/components/WeatherAlerts.jsx` | NWS alerts with severity colors |
| `src/components/SpaceWeather.jsx` | Kp gauge, NOAA scales, solar wind chart |
| `src/components/Astronomy.jsx` | Sun arc, moon phase, ISS, NASA APOD |
| `src/components/FlightTracker.jsx` | Leaflet map with plane markers |
