// The sample flights are flown in Colorado, and the viewer shows wall-clock
// local time there. IGC B-records are UTC; we convert to America/Denver for
// display (handles MST/MDT automatically via the IANA database).
const DENVER_TZ = 'America/Denver'

const clockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DENVER_TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const shortClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DENVER_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const tzNameFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DENVER_TZ,
  timeZoneName: 'short',
})

/** "HH:MM:SS" in Denver local time. */
export function formatDenverClock(timeMs: number): string {
  // en-US 24h can emit "24:00:00" at midnight; normalize to "00".
  return clockFormatter.format(timeMs).replace(/^24/, '00')
}

/** "HH:MM" in Denver local time, for compact axis ticks. */
export function formatDenverClockShort(timeMs: number): string {
  return shortClockFormatter.format(timeMs).replace(/^24/, '00')
}

/** The Denver timezone abbreviation for the given instant, e.g. "MDT" or "MST". */
export function denverTzAbbrev(timeMs: number): string {
  const part = tzNameFormatter.formatToParts(timeMs).find((p) => p.type === 'timeZoneName')
  return part?.value ?? 'MT'
}

export function formatLocalClock(timeMs: number, timeZone: string, includeSeconds = true): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: false,
  }).format(timeMs).replace(/^24/, '00')
}

export function localTzAbbrev(timeMs: number, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(timeMs)
    .find((item) => item.type === 'timeZoneName')
  return part?.value ?? timeZone
}
