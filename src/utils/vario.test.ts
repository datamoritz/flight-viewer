import { describe, expect, it } from 'vitest'
import {
  buildVarioSegments,
  colorForVarioRate,
  slicePointsUpTo,
  VARIO_BANDS,
} from './vario'
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

describe('colorForVarioRate', () => {
  it('maps strong sink to the purple band', () => {
    expect(colorForVarioRate(-10)).toBe(VARIO_BANDS[0].color)
  })

  it('maps near-level flight to the yellow band', () => {
    expect(colorForVarioRate(0)).toBe('#facc15')
  })

  it('maps strong climb to the pink band', () => {
    expect(colorForVarioRate(10)).toBe(VARIO_BANDS[VARIO_BANDS.length - 1].color)
  })

  it('is monotonic: every band boundary picks the correct neighbor', () => {
    for (let i = 0; i < VARIO_BANDS.length - 1; i++) {
      const boundary = VARIO_BANDS[i].maxRateMs
      expect(colorForVarioRate(boundary - 0.01)).toBe(VARIO_BANDS[i].color)
      expect(colorForVarioRate(boundary + 0.01)).toBe(VARIO_BANDS[i + 1].color)
    }
  })
})

describe('buildVarioSegments', () => {
  it('returns an empty array for fewer than 2 fixes', () => {
    expect(buildVarioSegments([])).toEqual([])
    expect(buildVarioSegments([makeFix({})])).toEqual([])
  })

  it('produces a single segment for a steady climb, with timestamps preserved', () => {
    const fixes = Array.from({ length: 10 }, (_, i) =>
      makeFix({ timeMs: i * 1000, altitude: i * 3, lat: i * 0.001, lng: 0 }),
    )
    const segments = buildVarioSegments(fixes)
    expect(segments).toHaveLength(1)
    expect(segments[0].points).toHaveLength(10)
    expect(segments[0].color).toBe(colorForVarioRate(3))
    expect(segments[0].points.map((p) => p.timeMs)).toEqual(fixes.map((f) => f.timeMs))
  })

  it('splits into multiple segments across a climb-then-sink transition', () => {
    const climbing = Array.from({ length: 10 }, (_, i) =>
      makeFix({ timeMs: i * 1000, altitude: i * 4, lat: i * 0.001 }),
    )
    const lastClimbAlt = climbing[climbing.length - 1].altitude
    const lastClimbTime = climbing[climbing.length - 1].timeMs
    const sinking = Array.from({ length: 10 }, (_, i) =>
      makeFix({
        timeMs: lastClimbTime + (i + 1) * 1000,
        altitude: lastClimbAlt - (i + 1) * 4,
        lat: (climbing.length + i) * 0.001,
      }),
    )
    const segments = buildVarioSegments([...climbing, ...sinking])
    expect(segments.length).toBeGreaterThanOrEqual(2)
    expect(segments[0].color).toBe(colorForVarioRate(4))
    expect(segments[segments.length - 1].color).toBe(colorForVarioRate(-4))
  })

  it('keeps segment boundaries connected by sharing a vertex', () => {
    const fixes = [
      makeFix({ timeMs: 0, altitude: 0, lat: 0 }),
      makeFix({ timeMs: 1000, altitude: 0, lat: 0.001 }), // ~0 m/s -> yellow band
      makeFix({ timeMs: 2000, altitude: 20, lat: 0.002 }), // 20 m/s -> pink band
    ]
    const segments = buildVarioSegments(fixes)
    if (segments.length > 1) {
      const boundary = segments[0].points[segments[0].points.length - 1]
      expect(segments[1].points[0]).toEqual(boundary)
    }
  })

  it('covers every input fix across all segments combined (no gaps)', () => {
    const fixes = Array.from({ length: 30 }, (_, i) =>
      makeFix({
        timeMs: i * 1000,
        altitude: Math.sin(i / 3) * 20,
        lat: i * 0.001,
      }),
    )
    const segments = buildVarioSegments(fixes)
    const totalPoints = segments.reduce((sum, s) => sum + s.points.length, 0)
    // Shared boundary vertices mean total points >= fixes.length.
    expect(totalPoints).toBeGreaterThanOrEqual(fixes.length)
    expect(segments[0].points[0].timeMs).toBe(fixes[0].timeMs)
    const lastFix = fixes[fixes.length - 1]
    const lastSegment = segments[segments.length - 1]
    expect(lastSegment.points[lastSegment.points.length - 1].timeMs).toBe(lastFix.timeMs)
  })
})

describe('slicePointsUpTo (progressive track reveal)', () => {
  const points = Array.from({ length: 5 }, (_, i) => ({
    lat: i,
    lng: i,
    altitude: i * 100,
    timeMs: i * 1000,
  }))

  it('returns nothing before the first point', () => {
    expect(slicePointsUpTo(points, -1)).toEqual([])
  })

  it('returns only points at or before the given time', () => {
    const visible = slicePointsUpTo(points, 2500)
    expect(visible).toHaveLength(3)
    expect(visible[2]).toMatchObject({ timeMs: 2000 })
  })

  it('appends the interpolated tip after the last visible point', () => {
    const tip = { lat: 2.5, lng: 2.5, altitude: 250 }
    const visible = slicePointsUpTo(points, 2500, tip)
    expect(visible).toHaveLength(4)
    expect(visible[3]).toBe(tip)
  })

  it('does not append a tip when no points are visible yet', () => {
    expect(slicePointsUpTo(points, -1, { lat: 0, lng: 0, altitude: 0 })).toEqual([])
  })

  it('returns all points (plus tip) at or past the end', () => {
    const tip = { lat: 4, lng: 4, altitude: 400 }
    expect(slicePointsUpTo(points, 99_999, tip)).toHaveLength(6)
  })
})
