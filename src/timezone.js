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

// Get numeric hour (0-23) in Central time
export function getCentralHour(date) {
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }).formatToParts(date)
  const hourPart = parts.find(p => p.type === 'hour')
  return parseInt(hourPart?.value || '0', 10)
}
