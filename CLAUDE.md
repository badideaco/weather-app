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
| IEM Mesonet | mesonet.agron.iastate.edu | NEXRAD radar tiles (timestamped archive layers) |
| NOAA SWPC | services.swpc.noaa.gov | Kp index, solar wind, NOAA scales |
| OpenSky | opensky-network.org | Live flight tracking |
| NASA | api.nasa.gov (DEMO_KEY) | Astronomy Picture of the Day |
| Where's ISS | api.wheretheiss.at | ISS position |
| Zippopotam | api.zippopotam.us | ZIP code geocoding |

## Radar Architecture (June 2026)
- Frames are IEM **timestamped archive layers**: `ridge::USCOMP-N0Q-YYYYMMDDHHMM` (5-min grid, 12 frames = 55 min history). NEVER use the relative-time layers (`nexrad-n0q-mXXm-900913`) — they re-point to newer scans as time passes, which breaks caching and time labels.
- Latest valid time comes from `mesonet.agron.iastate.edu/json/tms.json` (`ridge_uscomp_n0q.utc_valid`).
- `RadarOverlay` mounts **one Leaflet tile layer per frame** (opacity 0) and animates by toggling opacity — no network traffic during playback. iOS Safari memory is bounded by `maxNativeZoom: 8` + `keepBuffer: 0` (the old single-layer setUrl design existed to avoid an OOM; this solves it properly).
- The 5-min refresh diffs frames by path, so only the newest layer loads and the animation doesn't reset.

## Push Notifications (June 2026)
OS-level weather alert notifications work with the PWA closed, via Web Push:
- **Backend**: `server/` → `weather-push` Lambda (container image, **arm64**, ECR repo `weather-push`), Function URL `https://5k7qfuej6544m6hf5wxz7fc6mq0nxgit.lambda-url.us-east-2.on.aws`, DynamoDB `weather-push-state` (key `stateKey`, TTL attr `ttl`), EventBridge rule `weather-push-poll` (rate 5 min).
- Poll cycle: scan `sub#` items → one NWS `alerts/active?point=` query per unique rounded lat/lon → pywebpush each alert not yet in `sent#<sub>#<alert>` (TTL 7d). Stale subscriptions (404/410) auto-delete.
- Env vars on Lambda: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `AUTH_TOKEN`, `DYNAMO_TABLE`. The auth token is anti-spam, also embedded in the frontend bundle.
- **Frontend**: `src/hooks/usePushNotifications.js` (subscribe sends `{subscription, lat, lon}`); bell button in App header toggles. Re-registers on every app open (refreshes TTL + location).
- **Service worker**: `src/sw.js` via vite-plugin-pwa **injectManifest** (generateSW can't add push handlers). Holds precache, runtime caching, `push` + `notificationclick` handlers. Tile caches need `CacheableResponsePlugin({statuses:[0,200]})` — tile requests are opaque.
- **iOS requirements**: app installed to home screen (16.4+), permission requested inside a tap. Page-context `new Notification()` does NOT exist on iOS and throws on Android — always use `registration.showNotification()`.
- Backend deploy: `cd server && docker build --platform linux/arm64 --provenance=false -t weather-push-build . && docker tag ... weather-push:build-<ts> && docker push ... && aws lambda update-function-code --function-name weather-push --image-uri ...`

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
| `src/components/HourlyForecast.jsx` | 48-hour horizontal scroll, day separators, tap-for-detail (uses `probabilityOfPrecipitation.value` — hourly periods have NO detailedForecast text) |
| `src/components/DailyForecast.jsx` | 7-day forecast with temp bars |
| `src/components/RadarMap.jsx` | Leaflet map + RainViewer radar animation |
| `src/components/WeatherAlerts.jsx` | NWS alerts with severity colors |
| `src/components/SpaceWeather.jsx` | Kp gauge, NOAA scales, solar wind chart |
| `src/components/Astronomy.jsx` | Sun arc, moon phase, ISS, NASA APOD |
| `src/components/FlightTracker.jsx` | Leaflet map with plane markers |
