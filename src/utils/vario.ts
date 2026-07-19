import type { Fix } from '../igc/types'
import type { LatLngAltitudeLiteral } from '../types/maps3d'

export interface VarioBand {
  /** Upper bound (exclusive) of this band's climb/sink rate in m/s. `Infinity` for the last band. */
  maxRateMs: number
  color: string
}

/**
 * 9-band vario color scale, strong sink (purple) through strong climb (pink),
 * matching common paragliding flight-instrument color conventions.
 */
export const VARIO_BANDS: VarioBand[] = [
  { maxRateMs: -4, color: '#7c3aed' }, // purple: strong sink
  { maxRateMs: -2.5, color: '#1d4ed8' }, // dark blue
  { maxRateMs: -1.5, color: '#2563eb' }, // blue
  { maxRateMs: -0.5, color: '#38bdf8' }, // light blue
  { maxRateMs: 0.5, color: '#facc15' }, // yellow: near level
  { maxRateMs: 1.5, color: '#fb923c' }, // orange-yellow
  { maxRateMs: 2.5, color: '#f97316' }, // orange
  { maxRateMs: 4, color: '#ef4444' }, // red
  { maxRateMs: Infinity, color: '#ec4899' }, // pink: strong climb
]

export function colorForVarioRate(rateMs: number): string {
  for (const band of VARIO_BANDS) {
    if (rateMs < band.maxRateMs) return band.color
  }
  return VARIO_BANDS[VARIO_BANDS.length - 1].color
}

/** A track vertex that keeps its timestamp so the track can be revealed progressively during playback. */
export interface TimedPathPoint extends LatLngAltitudeLiteral {
  altitude: number
  timeMs: number
}

function toPoint(fix: Fix): TimedPathPoint {
  return { lat: fix.lat, lng: fix.lng, altitude: fix.altitude, timeMs: fix.timeMs }
}

const SMOOTHING_WINDOW = 3

/** Simple centered moving-average smoothing to reduce GPS-noise-driven color flicker. */
function smoothRates(rawRates: number[]): number[] {
  if (rawRates.length === 0) return []
  const half = Math.floor(SMOOTHING_WINDOW / 2)
  return rawRates.map((_, i) => {
    const lo = Math.max(0, i - half)
    const hi = Math.min(rawRates.length - 1, i + half)
    let sum = 0
    for (let j = lo; j <= hi; j++) sum += rawRates[j]
    return sum / (hi - lo + 1)
  })
}

export interface ColoredSegment {
  points: TimedPathPoint[]
  color: string
}

/**
 * Splits fixes into contiguous runs sharing the same vario color band, based
 * on each point-to-point climb/sink rate (smoothed to reduce noise-driven
 * flicker). Consecutive same-color runs are merged into a single path so the
 * map renders a manageable number of polyline segments instead of one per
 * point-pair; segment boundaries share a vertex so the track stays visually
 * connected. Points carry their timestamps so playback can reveal each
 * segment progressively.
 */
export function buildVarioSegments(fixes: Fix[]): ColoredSegment[] {
  if (fixes.length < 2) return []

  const rawRates: number[] = []
  for (let i = 1; i < fixes.length; i++) {
    const prev = fixes[i - 1]
    const curr = fixes[i]
    const dtSeconds = (curr.timeMs - prev.timeMs) / 1000
    rawRates.push(dtSeconds > 0 ? (curr.altitude - prev.altitude) / dtSeconds : 0)
  }
  const rates = smoothRates(rawRates)

  const segments: ColoredSegment[] = []
  let currentPoints: TimedPathPoint[] = [toPoint(fixes[0])]
  let currentColor = colorForVarioRate(rates[0])

  for (let i = 1; i < fixes.length; i++) {
    const color = colorForVarioRate(rates[i - 1])
    if (color !== currentColor) {
      currentPoints.push(toPoint(fixes[i]))
      segments.push({ points: currentPoints, color: currentColor })
      currentPoints = [toPoint(fixes[i])]
      currentColor = color
    } else {
      currentPoints.push(toPoint(fixes[i]))
    }
  }
  segments.push({ points: currentPoints, color: currentColor })

  return segments
}

/**
 * The portion of a segment's path visible at `timeMs`, for progressive track
 * reveal: every point at or before the timestamp, with `tip` (the exactly
 * interpolated current position) appended so the leading edge grows smoothly
 * between fixes rather than jumping point-to-point.
 */
export function slicePointsUpTo(
  points: TimedPathPoint[],
  timeMs: number,
  tip?: LatLngAltitudeLiteral,
): LatLngAltitudeLiteral[] {
  const visible: LatLngAltitudeLiteral[] = []
  for (const p of points) {
    if (p.timeMs > timeMs) break
    visible.push(p)
  }
  if (tip && visible.length > 0) visible.push(tip)
  return visible
}
