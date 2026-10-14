// Central Time — all displayed times should be in this zone
export const TZ = 'America/Chicago'

export function formatTime(date) {
  if (!(date instanceof Date) || isNaN(date)) return '--'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
}

export function formatHourOnly(date) {
  if (!(date instanceof Date) || isNaN(date)) return '--'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', timeZone: TZ })
}

export function formatDateTime(date) {
  if (!(date instanceof Date) || isNaN(date)) return '--'
  return date.toLocaleString('en-US', { timeZone: TZ })
}

export function formatDate(date, opts = {}) {
  if (!(date instanceof Date) || isNaN(date)) return '--'
  return date.toLocaleDateString('en-US', { timeZone: TZ, ...opts })
}

// Compact hour label: "12a", "3p", etc.
export function getHourLabel(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return '--'
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true, timeZone: TZ }).formatToParts(d)
  const hourPart = parts.find(p => p.type === 'hour')
  const periodPart = parts.find(p => p.type === 'dayPeriod')
  const h = hourPart?.value || '0'
  const period = (periodPart?.value || 'AM').toLowerCase().charAt(0)
  return `${h}${period}`
}

// Relative label for a unix-seconds timestamp: "Now", "45m ago", "21h ago",
// "+30m". Shared by the radar, satellite and aurora players.
export function relativeLabel(unixSec) {
  const diffMin = Math.round((unixSec - Date.now() / 1000) / 60)
  const abs = Math.abs(diffMin)
  if (abs <= 1) return 'Now'
  let span
  if (abs < 90) span = `${abs}m`
  else if (abs < 600) {
    const h = Math.floor(abs / 60), m = Math.round((abs % 60) / 15) * 15
    span = m === 60 ? `${h + 1}h` : m ? `${h}h ${m}m` : `${h}h`
  } else span = `${Math.round(abs / 60)}h`
  return diffMin < 0 ? `${span} ago` : `+${span}`
}

// Get numeric hour (0-23) in Central time
export function getCentralHour(date) {
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }).formatToParts(date)
  const hourPart = parts.find(p => p.type === 'hour')
  return parseInt(hourPart?.value || '0', 10)
}
