import type { ParsedFlight } from '../igc/types'
import { anchorForFix, anchorForTime, nearestFixByGps, type FlightAnchor } from './anchor'
import type { PhotoPlacementSource } from './types'

export interface PhotoExif {
  captureTimeMs?: number
  lat?: number
  lng?: number
}

export interface PhotoPlacement {
  anchor: FlightAnchor
  source: PhotoPlacementSource
}

export function matchPhotoToFlight(
  flight: ParsedFlight,
  exif: PhotoExif,
  fallbackTimeMs: number,
  offsetMs: number,
): PhotoPlacement {
  const adjustedTime = exif.captureTimeMs === undefined ? undefined : exif.captureTimeMs + offsetMs
  if (adjustedTime !== undefined && exif.lat !== undefined && exif.lng !== undefined) {
    const byTime = anchorForTime(flight, adjustedTime)
    const byGps = nearestFixByGps(flight.fixes, { lat: exif.lat, lng: exif.lng })
    const blendedIndex = Math.round((byTime.fixIndex * 2 + byGps) / 3)
    return { anchor: anchorForFix(flight, blendedIndex), source: 'exif-time-gps' }
  }
  if (adjustedTime !== undefined) return { anchor: anchorForTime(flight, adjustedTime), source: 'exif-time' }
  if (exif.lat !== undefined && exif.lng !== undefined) {
    return { anchor: anchorForFix(flight, nearestFixByGps(flight.fixes, { lat: exif.lat, lng: exif.lng })), source: 'exif-gps' }
  }
  return { anchor: anchorForTime(flight, fallbackTimeMs), source: 'current-playback' }
}
