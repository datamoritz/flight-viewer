import { describe, expect, it } from 'vitest'
import { interpolateFix } from './interpolate'
import type { Fix } from '../igc/types'

function makeFix(overrides: Partial<Fix>): Fix {
  return {
    timeMs: 0,
    lat: 0,
    lng: 0,
    altitude: 0,
    altitudeSource: 'gps',
    gpsAltitude: 0,
    pressureAltitude: 0,
    ...overrides,
  }
}

const fixes: Fix[] = [
  makeFix({ timeMs: 1000, lat: 10, lng: 20, altitude: 100 }),
  makeFix({ timeMs: 2000, lat: 12, lng: 22, altitude: 200 }),
  makeFix({ timeMs: 4000, lat: 16, lng: 26, altitude: 400 }),
]

describe('interpolateFix', () => {
  it('returns the exact fix when timeMs matches a fix exactly', () => {
    const pos = interpolateFix(fixes, 2000)
    expect(pos).toEqual({ timeMs: 2000, lat: 12, lng: 22, altitude: 200 })
  })

  it('linearly interpolates between two bracketing fixes', () => {
    const pos = interpolateFix(fixes, 1500)
    expect(pos.lat).toBeCloseTo(11, 6)
    expect(pos.lng).toBeCloseTo(21, 6)
    expect(pos.altitude).toBeCloseTo(150, 6)
  })

  it('interpolates correctly across an uneven gap between fixes', () => {
    // 3000 is 1/2 of the way from 2000 -> 4000
    const pos = interpolateFix(fixes, 3000)
    expect(pos.lat).toBeCloseTo(14, 6)
    expect(pos.altitude).toBeCloseTo(300, 6)
  })

  it('clamps to the first fix when timeMs is before the flight start', () => {
    const pos = interpolateFix(fixes, 0)
    expect(pos).toEqual({ timeMs: 1000, lat: 10, lng: 20, altitude: 100 })
  })

  it('clamps to the last fix when timeMs is after the flight end', () => {
    const pos = interpolateFix(fixes, 999999)
    expect(pos).toEqual({ timeMs: 4000, lat: 16, lng: 26, altitude: 400 })
  })

  it('handles a single-fix flight without dividing by zero', () => {
    const single = [makeFix({ timeMs: 500, lat: 1, lng: 2, altitude: 3 })]
    expect(interpolateFix(single, 0)).toEqual({ timeMs: 500, lat: 1, lng: 2, altitude: 3 })
    expect(interpolateFix(single, 999)).toEqual({ timeMs: 500, lat: 1, lng: 2, altitude: 3 })
  })
})
