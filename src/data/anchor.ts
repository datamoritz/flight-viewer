import type { Fix, ParsedFlight } from '../igc/types'

export interface FlightAnchor {
  fixIndex: number
  elapsedSeconds: number
  timeMs: number
  lat: number
  lng: number
  altitude: number
}
export function anchorForTime(flight: ParsedFlight, timeMs: number): FlightAnchor {
  const fixes = flight.fixes
  let bestIndex = 0
  let bestDelta = Math.abs(fixes[0].timeMs - timeMs)
  for (let i = 1; i < fixes.length; i++) {
    const delta = Math.abs(fixes[i].timeMs - timeMs)
    if (delta < bestDelta) {
      bestDelta = delta
      bestIndex = i
    }
  }
  return anchorForFix(flight, bestIndex)
}

export function anchorForFix(flight: ParsedFlight, fixIndex: number): FlightAnchor {
  const clamped = Math.min(Math.max(0, fixIndex), flight.fixes.length - 1)
  const fix = flight.fixes[clamped]
  return {
    fixIndex: clamped,
    elapsedSeconds: Math.max(0, (fix.timeMs - flight.startTimeMs) / 1000),
    timeMs: fix.timeMs,
    lat: fix.lat,
    lng: fix.lng,
    altitude: fix.altitude,
  }
}

export function nearestFixByGps(fixes: Fix[], point: { lat: number; lng: number }): number {
  let bestIndex = 0
  let bestScore = Number.POSITIVE_INFINITY
  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i]
    const score = (fix.lat - point.lat) ** 2 + (fix.lng - point.lng) ** 2
    if (score < bestScore) {
      bestScore = score
      bestIndex = i
    }
  }
  return bestIndex
}
