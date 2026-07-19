import { describe, expect, it } from 'vitest'
import { denverTzAbbrev, formatDenverClock, formatDenverClockShort } from './time'

describe('Denver time formatting', () => {
  // 2026-07-18T19:09:36Z → Denver is MDT (UTC-6) in July → 13:09:36.
  const summerUtc = Date.UTC(2026, 6, 18, 19, 9, 36)
  // 2026-01-15T19:09:36Z → Denver is MST (UTC-7) in January → 12:09:36.
  const winterUtc = Date.UTC(2026, 0, 15, 19, 9, 36)

  it('formats a UTC instant as Denver local wall-clock (MDT)', () => {
    expect(formatDenverClock(summerUtc)).toBe('13:09:36')
  })

  it('applies standard time offset in winter (MST)', () => {
    expect(formatDenverClock(winterUtc)).toBe('12:09:36')
  })

  it('formats a short HH:MM clock', () => {
    expect(formatDenverClockShort(summerUtc)).toBe('13:09')
  })

  it('reports the correct timezone abbreviation per season', () => {
    expect(denverTzAbbrev(summerUtc)).toBe('MDT')
    expect(denverTzAbbrev(winterUtc)).toBe('MST')
  })
})
