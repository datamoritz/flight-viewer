import type { Fix } from './types'

/** Perpendicular distance (in degrees^2-ish planar units) from point p to the line a-b. */
function perpendicularDistanceSq(p: Fix, a: Fix, b: Fix): number {
  const dx = b.lng - a.lng
  const dy = b.lat - a.lat
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) {
    const ex = p.lng - a.lng
    const ey = p.lat - a.lat
    return ex * ex + ey * ey
  }
  const t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / lengthSq
  const clampedT = Math.max(0, Math.min(1, t))
  const projLng = a.lng + clampedT * dx
  const projLat = a.lat + clampedT * dy
  const ex = p.lng - projLng
  const ey = p.lat - projLat
  return ex * ex + ey * ey
}

function douglasPeucker(fixes: Fix[], toleranceSq: number): Fix[] {
  if (fixes.length <= 2) return fixes

  let maxDistSq = 0
  let maxIndex = 0
  const first = fixes[0]
  const last = fixes[fixes.length - 1]

  for (let i = 1; i < fixes.length - 1; i++) {
    const distSq = perpendicularDistanceSq(fixes[i], first, last)
    if (distSq > maxDistSq) {
      maxDistSq = distSq
      maxIndex = i
    }
  }

  if (maxDistSq <= toleranceSq) {
    return [first, last]
  }

  const left = douglasPeucker(fixes.slice(0, maxIndex + 1), toleranceSq)
  const right = douglasPeucker(fixes.slice(maxIndex), toleranceSq)
  return [...left.slice(0, -1), ...right]
}

/**
 * Reduces the number of points used to render the 3D polyline while preserving
 * the flight's shape. The full-resolution `fixes` array is always kept separately
 * for interpolation and the altitude profile.
 */
export function simplifyFixes(
  fixes: Fix[],
  toleranceDeg = 0.00003,
  maxPoints = 3000,
): Fix[] {
  if (fixes.length <= 2) return fixes

  let simplified = douglasPeucker(fixes, toleranceDeg * toleranceDeg)

  if (simplified.length > maxPoints) {
    const stride = Math.ceil(simplified.length / maxPoints)
    simplified = simplified.filter(
      (_, i) => i % stride === 0 || i === simplified.length - 1,
    )
  }

  return simplified
}
