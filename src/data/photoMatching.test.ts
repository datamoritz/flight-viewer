import { describe, expect, it } from 'vitest'
import { matchPhotoToFlight } from './photoMatching'
import type { ParsedFlight } from '../igc/types'

const flight: ParsedFlight = {
  pilotName: 'Pilot',
  startTimeMs: 0,
  endTimeMs: 30000,
  minAltitude: 100,
  maxAltitude: 300,
  fixes: [
    { timeMs: 0, lat: 46, lng: 8, altitude: 100, altitudeSource: 'gps', gpsAltitude: 100, pressureAltitude: null },
    { timeMs: 10000, lat: 46.1, lng: 8.1, altitude: 200, altitudeSource: 'gps', gpsAltitude: 200, pressureAltitude: null },
    { timeMs: 30000, lat: 46.2, lng: 8.2, altitude: 300, altitudeSource: 'gps', gpsAltitude: 300, pressureAltitude: null },
  ],
  simplifiedFixes: [],
}

describe('photo matching', () => {
  it('uses timestamp matching when EXIF time exists', () => {
    const placement = matchPhotoToFlight(flight, { captureTimeMs: 9500 }, 0, 0)
    expect(placement.source).toBe('exif-time')
    expect(placement.anchor.fixIndex).toBe(1)
  })

  it('applies batch time offset before matching', () => {
    const placement = matchPhotoToFlight(flight, { captureTimeMs: 0 }, 0, 10000)
    expect(placement.source).toBe('exif-time')
    expect(placement.anchor.fixIndex).toBe(1)
  })

  it('falls back to current playback when EXIF has no useful placement data', () => {
    const placement = matchPhotoToFlight(flight, {}, 30000, 0)
    expect(placement.source).toBe('current-playback')
    expect(placement.anchor.fixIndex).toBe(2)
  })
})
