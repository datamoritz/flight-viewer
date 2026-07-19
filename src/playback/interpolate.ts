import type { Fix } from '../igc/types'

export interface InterpolatedPosition {
  timeMs: number
  lat: number
  lng: number
  altitude: number
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Finds the interpolated position/altitude at `timeMs` by binary-searching the
 * chronologically-sorted fixes and linearly interpolating between the two that
 * bracket it. Clamps to the first/last fix when `timeMs` is outside the flight.
 */
export function interpolateFix(fixes: Fix[], timeMs: number): InterpolatedPosition {
  if (fixes.length === 0) {
    throw new Error('interpolateFix requires at least one fix')
  }
  if (fixes.length === 1 || timeMs <= fixes[0].timeMs) {
    const f = fixes[0]
    return { timeMs: f.timeMs, lat: f.lat, lng: f.lng, altitude: f.altitude }
  }
  const last = fixes[fixes.length - 1]
  if (timeMs >= last.timeMs) {
    return { timeMs: last.timeMs, lat: last.lat, lng: last.lng, altitude: last.altitude }
  }

  let lo = 0
  let hi = fixes.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (fixes[mid].timeMs <= timeMs) {
      lo = mid
    } else {
      hi = mid
    }
  }

  const a = fixes[lo]
  const b = fixes[hi]
  const span = b.timeMs - a.timeMs
  const t = span === 0 ? 0 : (timeMs - a.timeMs) / span

  return {
    timeMs,
    lat: lerp(a.lat, b.lat, t),
    lng: lerp(a.lng, b.lng, t),
    altitude: lerp(a.altitude, b.altitude, t),
  }
}
