import { describe, expect, it } from 'vitest'
import type { NewFlightInput, NewMomentInput } from './types'

describe('repository payloads', () => {
  it('keeps flight metadata JSON serializable apart from stored file text', () => {
    const input: NewFlightInput = {
      hash: 'abc',
      title: 'Flight',
      originalFilename: 'flight.igc',
      pilotName: 'Pilot',
      startTimeMs: 1,
      endTimeMs: 2,
      durationSeconds: 1,
      minAltitude: 100,
      maxAltitude: 200,
      totalDistanceMeters: 12000,
      optimizedDistanceMeters: 8500,
      startLat: 46,
      startLng: 8,
      startLocationLabel: 'Boulder, CO',
      igcText: 'AFLIGHT',
    }
    expect(JSON.parse(JSON.stringify(input))).toEqual(input)
  })

  it('serializes moment anchors without depending on parsed flight objects', () => {
    const input: NewMomentInput = {
      flightId: 'flight_1',
      fixIndex: 3,
      elapsedSeconds: 12,
      timeMs: 12000,
      lat: 46,
      lng: 8,
      altitude: 1500,
      commentText: 'Thermal',
    }
    expect(JSON.parse(JSON.stringify(input))).toEqual(input)
  })
})
