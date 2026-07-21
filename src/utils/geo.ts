import type { Fix } from '../igc/types'

export interface LatLngBounds {
  north: number
  south: number
  east: number
  west: number
}

export interface CameraFit {
  center: { lat: number; lng: number; altitude: number }
  range: number
  heading: number
  tilt: number
}

const EARTH_RADIUS_M = 6_371_000

export function computeBounds(fixes: Fix[]): LatLngBounds {
  let north = -90
  let south = 90
  let east = -180
  let west = 180
  for (const fix of fixes) {
    if (fix.lat > north) north = fix.lat
    if (fix.lat < south) south = fix.lat
    if (fix.lng > east) east = fix.lng
    if (fix.lng < west) west = fix.lng
  }
  return { north, south, east, west }
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

/** Great-circle distance in meters between two lat/lng points. */
export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial compass bearing in degrees (0-360) from point a to point b. */
export function bearingDegrees(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export function cumulativeTrackDistanceMeters(fixes: Fix[]): number {
  let distance = 0
  for (let i = 1; i < fixes.length; i++) {
    distance += haversineDistanceMeters(fixes[i - 1], fixes[i])
  }
  return distance
}

export function roughOptimizedFreeDistanceMeters(fixes: Fix[], maxSamples = 500): number {
  if (fixes.length < 2) return 0
  const stride = Math.max(1, Math.ceil(fixes.length / maxSamples))
  const samples = fixes.filter((_, index) => index % stride === 0)
  if (samples[samples.length - 1] !== fixes[fixes.length - 1]) samples.push(fixes[fixes.length - 1])
  let best = 0
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      best = Math.max(best, haversineDistanceMeters(samples[i], samples[j]))
    }
  }
  return best
}

/**
 * Computes a cinematic default camera (center/range/heading/tilt) that frames
 * the whole flight, used to fit the camera when a file is first loaded.
 */
export function computeCameraFit(fixes: Fix[]): CameraFit {
  const bounds = computeBounds(fixes)
  const centerLat = (bounds.north + bounds.south) / 2
  const centerLng = (bounds.east + bounds.west) / 2

  let maxAltitude = fixes[0]?.altitude ?? 0
  for (const fix of fixes) {
    if (fix.altitude > maxAltitude) maxAltitude = fix.altitude
  }

  const diagonalMeters = haversineDistanceMeters(
    { lat: bounds.south, lng: bounds.west },
    { lat: bounds.north, lng: bounds.east },
  )

  // Empirical scale so the whole flight comfortably fits in frame at a 60deg tilt.
  const range = Math.max(1500, diagonalMeters * 1.4)

  const heading =
    fixes.length > 1 ? bearingDegrees(fixes[0], fixes[fixes.length - 1]) : 0

  return {
    center: { lat: centerLat, lng: centerLng, altitude: maxAltitude },
    range,
    heading,
    tilt: 60,
  }
}
