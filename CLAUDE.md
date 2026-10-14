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

## Data Sources (free; only NASA uses a key, the shared DEMO_KEY)
| Source | API | Data |
|--------|-----|------|
| NWS | api.weather.gov | Station observations (history, see below), hourly/daily forecast, alerts at the user's point |
| IEM Mesonet | mesonet.agron.iastate.edu | NEXRAD radar tiles (timestamped layers), `json/tms.json`, active storm-based warning polygons (`geojson/sbw.geojson`) |
| Esri | server.arcgisonline.com | Dark Gray Canvas basemap + labels (`DarkBasemap.jsx`), no key |
| Blitzortung | wss://ws1 / ws8.blitzortung.org | Live lightning (private, non-commercial use) |
| Open-Meteo | api / archive-api / air-quality-api.open-meteo.com | 15-min precip nowcast, 16-day outlook, UV index, yesterday's high/low, air quality, pollen |
| SPC | www.spc.noaa.gov | Day 1 convective outlook GeoJSON |
| NOAA SWPC | services.swpc.noaa.gov | Kp, NOAA scales, solar wind speed + Bz (`products/summary/*`), aurora animation |
| NOAA STAR | cdn.star.nesdis.noaa.gov | GOES satellite imagery |
| NASA | api.nasa.gov (DEMO_KEY: ~30/h, 50/day **per IP**), epic.gsfc.nasa.gov | APOD, EPIC Earth images |
| EUMETSAT | eumetview.eumetsat.int | Meteosat full-disk images |
| adsb.lol | via flight-proxy Lambda | Live flights (NOT OpenSky) |
| Where's ISS | api.wheretheiss.at | ISS position |
| Zippopotam | api.zippopotam.us | ZIP code geocoding |

**Free upstreams change without erroring.** In Oct 2026 CARTO's basemap started serving "API KEY REQUIRED" tiles with HTTP 200, SWPC's `products/solar-wind/plasma-7-day.json` went 404 and the Kp product changed shape (rows → `{time_tag, Kp}` objects), Blitzortung stopped answering `{a:418}` and LZW-compressed its messages, and undated APOD requests returned 500. When something looks wrong, probe the upstream itself (curl it, look at the tile image) before reading the UI. Sections show `SectionNotice` on failure instead of disappearing.

## Current conditions (Oct 2026)
`getCurrentObservation` reads `/stations/{id}/observations?start=<now-3.5h>` (newest first, ~6 KB gzipped) for up to 3 nearest stations and uses the first whose newest report is under 90 min old. `/observations/latest` lagged the newest report. The hero description is the most significant weather reported in the last 15 min (5-minute ASOS reports flip between "Mostly Clear" and "Thunderstorms"); the hero shows the station and report age. Pressure tendency = same station, ~3 h apart (NOT Open-Meteo `surface_pressure`, which is unreduced and made every inland trend "Rising rapidly").

## Radar Architecture (June 2026)
- Frames are IEM **timestamped archive layers**: `ridge::USCOMP-N0Q-YYYYMMDDHHMM` (5-min grid, 12 frames = 55 min history). NEVER use the relative-time layers (`nexrad-n0q-mXXm-900913`) — they re-point to newer scans as time passes, which breaks caching and time labels.
- Latest valid time comes from `mesonet.agron.iastate.edu/json/tms.json` (`ridge_uscomp_n0q.utc_valid`).
- `RadarOverlay` mounts **one Leaflet tile layer per frame** (opacity 0) and animates by toggling opacity — no network traffic during playback. iOS Safari memory is bounded by `maxNativeZoom: 8` + `keepBuffer: 0` (the old single-layer setUrl design existed to avoid an OOM; this solves it properly).
- The 5-min refresh diffs frames by path, so only the newest layer loads and the animation doesn't reset.
- Radar and basemap tiles are requested with `crossOrigin` (both hosts send ACAO *), so the service worker caches only real 200s (`radar-tiles-v2`, `basemap-tiles`). Opaque responses could be 503s and are padded to MBs each in quota accounting.
- Warning polygons: IEM `sbw.geojson` (all active TO/SV/EW/FF/SQ warnings in the US, ~20 KB), so storms heading toward you show before they reach your point; falls back to the point alerts' polygons if IEM fails. Legend = IEM N0Q ramp + keys for warnings near the user.
- Lightning: Blitzortung websocket, subscribe `{a:111}`, LZW-decode each message, draw only strikes inside the map, canvas dots fade over 15 min, badge shows the real feed state (live / connecting / paused / offline), socket closed while the page is hidden.

## Refresh model (Oct 2026)
App bumps `refreshKey` after every refresh attempt (10-min timer, header button, location change, and **reopen**: `visibilitychange`/`pageshow` refresh when data is >5 min old, since iOS suspends timers in the background). Sections that fetch their own data take `refreshKey` and refetch. APOD refetches at most hourly (DEMO_KEY budget); ISS position polls every 60 s while visible; the flight tracker polls only while on screen. The AI briefing caches per personality + alert set (a new or cancelled alert forces a new briefing) for 30 min.

## Push Notifications (June 2026)
OS-level weather alert notifications work with the PWA closed, via Web Push:
- **Backend**: `server/` → `weather-push` Lambda (container image, **arm64**, ECR repo `weather-push`), Function URL `https://5k7qfuej6544m6hf5wxz7fc6mq0nxgit.lambda-url.us-east-2.on.aws`, DynamoDB `weather-push-state` (key `stateKey`, TTL attr `ttl`), EventBridge rule `weather-push-poll` (rate 5 min).
- Poll cycle: scan `sub#` items → one NWS `alerts/active?point=` query per unique rounded lat/lon → pywebpush each alert not yet in `sent#<sub>#<alert>` (TTL 7d). Stale subscriptions (404/410) auto-delete.
- Env vars on Lambda: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `AUTH_TOKEN`, `DYNAMO_TABLE`. The auth token is anti-spam, also embedded in the frontend bundle.
- **Frontend**: `src/hooks/usePushNotifications.js` (subscribe sends `{subscription, lat, lon}`); bell button in App header toggles. Re-registers on every app open (refreshes TTL + location).
- **Service worker**: `src/sw.js` via vite-plugin-pwa **injectManifest** (generateSW can't add push handlers). Holds precache, runtime caching, `push` + `notificationclick` handlers. Every CacheFirst rule needs a `CacheableResponsePlugin` (tiles are now CORS, so `statuses:[200]`; an opaque no-cors request would need `[0,200]` and can't tell a 503 from a tile).
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
- **Mostly client-side**, plus three Lambdas: `weather-push` (Web Push, `server/`), the AI briefing (`WeatherBriefing.jsx` BRIEFING_URL) and the adsb.lol flight proxy (`api.js` FLIGHT_PROXY)
- **Geolocation** with ZIP code fallback (saved to localStorage)
- **Progressive loading** - weather data fetched in parallel, sections render as data arrives
- **Lazy flight tracking** - only fetches when section scrolls into view (IntersectionObserver)
- **Service worker** - caches map + radar tiles and NWS/SWPC JSON (NetworkFirst); retired caches are deleted on activate

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
| `src/components/RadarMap.jsx` | Leaflet map + IEM radar animation, lightning, warning polygons, legend |
| `src/components/DarkBasemap.jsx` | Shared Esri dark basemap + labels + attribution (radar, flights, SPC) |
| `src/components/SectionNotice.jsx` | "Couldn't load" card for a section whose source failed |
| `src/components/WeatherBriefing.jsx` | AI forecaster briefing (5 personalities) via Lambda |
| `src/components/SPCOutlook.jsx` | SPC Day 1 outlook: risk at the user's point + highest nationally |
| `src/components/MinutelyPrecip.jsx` | Open-Meteo 15-min precipitation, next 4 hours |
| `src/components/SatelliteMap.jsx` / `EarthView.jsx` / `AuroraForecast.jsx` | GOES loops, full-disk views, SWPC aurora loop |
| `src/timezone.js` | Central-time formatters + shared `relativeLabel` |
| `src/components/WeatherAlerts.jsx` | NWS alerts with severity colors |
| `src/components/SpaceWeather.jsx` | Kp gauge, NOAA scales, solar wind chart |
| `src/components/Astronomy.jsx` | Sun arc, moon phase, ISS, NASA APOD |
| `src/components/FlightTracker.jsx` | Leaflet map with plane markers |
