import tzLookup from 'tz-lookup'

export function timeZoneForCoordinates(lat: number, lng: number): string {
  try {
    return tzLookup(lat, lng)
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  }
}

const TIME_ZONE_COUNTRIES: Record<string, string> = {
  'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Berlin': 'DE',
  'Europe/Paris': 'FR', 'Europe/Rome': 'IT', 'Europe/Ljubljana': 'SI',
  'Europe/Zagreb': 'HR', 'Europe/Prague': 'CZ', 'Europe/Bratislava': 'SK',
  'Europe/Warsaw': 'PL', 'Europe/London': 'GB', 'Europe/Madrid': 'ES',
  'Europe/Oslo': 'NO', 'Europe/Stockholm': 'SE', 'Europe/Helsinki': 'FI',
  'Pacific/Auckland': 'NZ', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU', 'Asia/Tokyo': 'JP',
}

function countryCodeForTimeZone(timeZone: string): string | null {
  if (TIME_ZONE_COUNTRIES[timeZone]) return TIME_ZONE_COUNTRIES[timeZone]
  if (timeZone.startsWith('America/')) {
    return ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg'].includes(timeZone) ? 'CA' : 'US'
  }
  return null
}

export function countryFlagForCoordinates(lat: number, lng: number): string {
  const code = countryCodeForTimeZone(timeZoneForCoordinates(lat, lng))
  if (!code) return '🌐'
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)))
}
