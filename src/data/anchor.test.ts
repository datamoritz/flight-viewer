import { describe, expect, it } from 'vitest'
import { anchorForTime, nearestFixByGps } from './anchor'
import type { ParsedFlight } from '../igc/types'

const flight: ParsedFlight = {
  pilotName: 'Pilot',
  startTimeMs: 1000,
  endTimeMs: 4000,
  minAltitude: 100,
  maxAltitude: 130,
  fixes: [
    { timeMs: 1000, lat: 46, lng: 8, altitude: 100, altitudeSource: 'gps', gpsAltitude: 100, pressureAltitude: null },
    { timeMs: 2000, lat: 47, lng: 9, altitude: 110, altitudeSource: 'gps', gpsAltitude: 110, pressureAltitude: null },
    { timeMs: 4000, lat: 48, lng: 10, altitude: 130, altitudeSource: 'gps', gpsAltitude: 130, pressureAltitude: null },
  ],
  simplifiedFixes: [],
}

describe('flight anchoring', () => {
  it('anchors moments to the nearest IGC fix', () => {
    expect(anchorForTime(flight, 2600)).toMatchObject({
      fixIndex: 1,
      elapsedSeconds: 1,
      timeMs: 2000,
      lat: 47,
      lng: 9,
      altitude: 110,
    })
  })

  it('finds the nearest GPS fix for photo placement', () => {
    expect(nearestFixByGps(flight.fixes, { lat: 47.1, lng: 9.1 })).toBe(1)
  })
})
