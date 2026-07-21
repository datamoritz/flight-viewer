import { useEffect, useMemo, useRef, useState } from 'react'
import { useGoogleMapsScript } from './useGoogleMapsScript'
import { useCameraAnimationGuard } from './cameraFollow'
import { CameraControls } from './CameraControls'
import { usePlaybackStore } from '../../playback/usePlaybackStore'
import { playbackStore } from '../../playback/store'
import { interpolateFix } from '../../playback/interpolate'
import { computeCameraFit } from '../../utils/geo'
import { buildVarioSegments, slicePointsUpTo, type TimedPathPoint } from '../../utils/vario'
import type { FlightMoment } from '../../data/types'
import type {
  LatLngAltitudeLiteral,
  Map3DElement,
  Maps3DLibrary,
  MarkerElement,
  Polyline3DElement,
} from '../../types/maps3d'

const DEFAULT_CAMERA = {
  center: { lat: 46.55, lng: 8.0, altitude: 0 },
  range: 80_000,
  heading: 0,
  tilt: 45,
}

const DROP_LINE_WIDTH = 3
const DROP_LINE_LIFETIME_MS = 20_000
const DROP_LINE_INTERVAL_MS = 250
const DROP_LINE_MAX_ALPHA = 0.22

// The pilot marker is one screen-space marker content bundle, not a separate
// React overlay, so the name and altitude stay glued to the red pointed tip.
const MARKER_ACCENT_COLOR = '#dc2626'
const MARKER_ACCENT_BORDER = '#7f1d1d'

// Always-follow camera: the pilot tracks through the user's chosen view. A pan
// stores a persistent camera offset, so playback follows the pilot at that new
// screen position instead of snapping it back to the viewport center. Heading,
// tilt, and range remain user-controlled.
const SETTLE_TAU_MS = 140
// Beyond this separation (~22 km), gliding would take too long — jump directly.
const SNAP_DISTANCE_DEG = 0.2
// Below these deltas the camera counts as on-pilot and writes are skipped, so
// a paused, settled scene produces zero camera-event churn.
const WRITE_EPSILON_DEG = 1e-7
const WRITE_EPSILON_ALT_M = 0.05
// Programmatic center writes interrupt in-flight user gestures in this alpha
// API, so the glide stands down while a pointer is down on the map and for a
// grace period after the last pointer/wheel activity — gestures always win,
// then the camera follows with whatever center offset the gesture left behind.
const GESTURE_POINTER_GRACE_MS = 300
const GESTURE_WHEEL_GRACE_MS = 450
interface TrackSegment {
  polyline: Polyline3DElement
  points: TimedPathPoint[]
  startMs: number
  endMs: number
}

interface DropLine {
  polyline: Polyline3DElement
  timeMs: number
  color: string
}

interface FollowOffset {
  lat: number
  lng: number
  altitude: number
}

export interface Map3DViewProps {
  apiKey: string | undefined
  showDropCurtain: boolean
  trackStrokeWidth: number
  moments: FlightMoment[]
  selectedMomentId: string | null
  onSelectMoment: (momentId: string) => void
}

function makePositionWithOffset(pos: LatLngAltitudeLiteral, offset: FollowOffset): LatLngAltitudeLiteral {
  return {
    lat: pos.lat + offset.lat,
    lng: pos.lng + offset.lng,
    altitude: (pos.altitude ?? 0) + offset.altitude,
  }
}

function makeOffsetFromPosition(center: LatLngAltitudeLiteral, pos: LatLngAltitudeLiteral): FollowOffset {
  return {
    lat: center.lat - pos.lat,
    lng: center.lng - pos.lng,
    altitude: (center.altitude ?? pos.altitude ?? 0) - (pos.altitude ?? 0),
  }
}

function colorWithAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#') || color.length !== 7) return color
  const r = Number.parseInt(color.slice(1, 3), 16)
  const g = Number.parseInt(color.slice(3, 5), 16)
  const b = Number.parseInt(color.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}

function makePilotMarkerContent(pilotName: string, altitude: number): HTMLElement {
  const root = document.createElement('div')
  root.className = 'pilot-marker-content'

  const cap = document.createElement('div')
  cap.className = 'pilot-marker-cap'

  const bar = document.createElement('div')
  bar.className = 'pilot-marker-bar'

  const head = document.createElement('div')
  head.className = 'pilot-marker-head'
  head.style.background = MARKER_ACCENT_COLOR
  head.style.borderColor = MARKER_ACCENT_BORDER

  const name = document.createElement('div')
  name.className = 'pilot-label-name'
  name.textContent = pilotName

  const altitudeLabel = document.createElement('div')
  altitudeLabel.className = 'pilot-label-altitude'
  altitudeLabel.textContent = `${Math.round(altitude)} m`

  root.append(cap, bar, head, name, altitudeLabel)
  return root
}

function makeMomentMarkerContent(moment: FlightMoment, selectedMomentId: string | null): HTMLElement {
  const root = document.createElement('button')
  root.type = 'button'
  root.className = `map-moment-marker ${moment.id === selectedMomentId ? 'is-selected' : ''}`
  root.setAttribute('aria-label', 'Flight comment')
  return root
}

export function Map3DView({ apiKey, showDropCurtain, trackStrokeWidth, moments, selectedMomentId, onSelectMoment }: Map3DViewProps) {
  const { status, error: scriptError } = useGoogleMapsScript(apiKey)
  const containerRef = useRef<HTMLDivElement>(null)
  const maps3dRef = useRef<Maps3DLibrary | null>(null)
  const trackRef = useRef<TrackSegment[]>([])
  const dropLinesRef = useRef<DropLine[]>([])
  const momentMarkersRef = useRef<MarkerElement[]>([])
  const momentSelectRef = useRef(onSelectMoment)
  const revealRef = useRef({ idx: 0, lastTimeMs: Number.NEGATIVE_INFINITY })
  const lastDropLineTimeRef = useRef(Number.NEGATIVE_INFINITY)
  const pilotMarkerRef = useRef<MarkerElement | null>(null)
  const altitudeLabelRef = useRef<HTMLDivElement | null>(null)
  const followOffsetRef = useRef<FollowOffset>({ lat: 0, lng: 0, altitude: 0 })
  const gestureRef = useRef({ pointerDown: false, lastPointerEnd: 0, lastWheel: 0 })
  const [map, setMap] = useState<Map3DElement | null>(null)
  const [initError, setInitError] = useState<string | null>(null)

  const flight = usePlaybackStore((s) => s.flight)
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs)
  const visibleMomentKey = useMemo(
    () => moments.filter((moment) => moment.timeMs <= currentTimeMs).map((moment) => moment.id).join('|'),
    [currentTimeMs, moments],
  )

  const { markCameraAnimation, isCameraAnimating } = useCameraAnimationGuard(map)

  useEffect(() => {
    momentSelectRef.current = onSelectMoment
  }, [onSelectMoment])

  // Create the Map3DElement once the bootstrap script + library are ready.
  useEffect(() => {
    if (status !== 'ready' || map) return
    let cancelled = false

    void (async () => {
      const google = window.google
      if (!google) return
      try {
        const maps3d = await google.maps.importLibrary('maps3d')
        if (cancelled) return
        maps3dRef.current = maps3d

        const el = new maps3d.Map3DElement({
          center: DEFAULT_CAMERA.center,
          range: DEFAULT_CAMERA.range,
          heading: DEFAULT_CAMERA.heading,
          tilt: DEFAULT_CAMERA.tilt,
          mode: 'SATELLITE',
        })
        el.style.width = '100%'
        el.style.height = '100%'
        el.style.display = 'block'
        // Rendering-time failures (hardware acceleration unavailable, quota
        // exhausted, key lacking 3D Maps access) surface via these events,
        // possibly long after successful construction — so the listeners are
        // deliberately NOT guarded by this effect's `cancelled` flag, which
        // flips as soon as setMap re-runs the effect.
        el.addEventListener('gmp-error', () => {
          setInitError(
            'The 3D map failed to load. This can happen if hardware acceleration is disabled in your browser, this API key doesn’t have 3D Maps access, or the API quota has been exceeded. See developers.google.com/maps/documentation/javascript/3d-maps-support.',
          )
        })
        el.addEventListener('gmp-map-id-error', () => {
          setInitError('This map configuration was rejected by Google Maps (invalid map ID).')
        })
        containerRef.current?.appendChild(el)
        setMap(el)
      } catch (err) {
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : 'Failed to initialize the 3D map.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [status, map])

  // Track user gesture activity on the map container so the follow glide can
  // stand down while (and shortly after) the user is interacting.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const g = gestureRef.current

    const onPointerDown = () => {
      g.pointerDown = true
    }
    const onPointerEnd = () => {
      if (g.pointerDown) {
        g.pointerDown = false
        g.lastPointerEnd = performance.now()
      }
    }
    const onWheel = () => {
      g.lastWheel = performance.now()
    }

    el.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointerup', onPointerEnd, true)
    window.addEventListener('pointercancel', onPointerEnd, true)
    el.addEventListener('wheel', onWheel, { capture: true, passive: true })
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointerup', onPointerEnd, true)
      window.removeEventListener('pointercancel', onPointerEnd, true)
      el.removeEventListener('wheel', onWheel, true)
    }
  }, [map])

  // Rebuild the vario-colored track segments + pilot marker whenever a (new) flight is loaded.
  // Track polylines start hidden (single-point paths) — the flight path is revealed
  // progressively by the sync loop as playback/scrubbing advances.
  useEffect(() => {
    if (!map || !maps3dRef.current) return

    for (const segment of trackRef.current) segment.polyline.remove()
    trackRef.current = []
    for (const line of dropLinesRef.current) line.polyline.remove()
    dropLinesRef.current = []
    lastDropLineTimeRef.current = Number.NEGATIVE_INFINITY
    pilotMarkerRef.current?.remove()
    pilotMarkerRef.current = null
    altitudeLabelRef.current = null
    followOffsetRef.current = { lat: 0, lng: 0, altitude: 0 }
    revealRef.current = { idx: 0, lastTimeMs: Number.NEGATIVE_INFINITY }

    if (!flight) return

    const maps3d = maps3dRef.current

    trackRef.current = buildVarioSegments(flight.fixes).map((segment) => {
      const polyline = new maps3d.Polyline3DElement({
        path: [segment.points[0]],
        strokeColor: segment.color,
        strokeWidth: trackStrokeWidth,
        altitudeMode: 'ABSOLUTE',
        drawsOccludedSegments: true,
      })
      map.appendChild(polyline)
      return {
        polyline,
        points: segment.points,
        startMs: segment.points[0].timeMs,
        endMs: segment.points[segment.points.length - 1].timeMs,
      }
    })

    const startPos = interpolateFix(flight.fixes, flight.startTimeMs)
    const pilotMarker = new maps3d.MarkerElement({
      position: startPos,
      altitudeMode: 'ABSOLUTE',
      anchorLeft: '-50%',
      anchorTop: '-100%',
      collisionBehavior: 'REQUIRED',
    })
    const markerContent = makePilotMarkerContent(flight.pilotName, startPos.altitude)
    altitudeLabelRef.current = markerContent.querySelector<HTMLDivElement>('.pilot-label-altitude')
    pilotMarker.append(markerContent)
    map.appendChild(pilotMarker)
    pilotMarkerRef.current = pilotMarker

    const fit = computeCameraFit(flight.fixes)
    const fitDurationMillis = 3000
    markCameraAnimation(fitDurationMillis)
    map.flyCameraTo({
      endCamera: {
        center: fit.center,
        range: fit.range,
        heading: fit.heading,
        tilt: fit.tilt,
      },
      durationMillis: fitDurationMillis,
    })
  }, [map, flight, markCameraAnimation])

  useEffect(() => {
    for (const segment of trackRef.current) segment.polyline.strokeWidth = trackStrokeWidth
  }, [trackStrokeWidth])

  useEffect(() => {
    if (!map || !maps3dRef.current) return
    for (const marker of momentMarkersRef.current) marker.remove()
    momentMarkersRef.current = []
    const maps3d = maps3dRef.current
    const visibleMomentIds = new Set(visibleMomentKey ? visibleMomentKey.split('|') : [])
    for (const moment of moments) {
      if (!visibleMomentIds.has(moment.id)) continue
      const marker = new maps3d.MarkerElement({
        position: { lat: moment.lat, lng: moment.lng, altitude: moment.altitude },
        altitudeMode: 'ABSOLUTE',
        anchorLeft: '-50%',
        anchorTop: '-50%',
        collisionBehavior: 'REQUIRED',
      })
      const content = makeMomentMarkerContent(moment, selectedMomentId)
      content.addEventListener('click', (event) => {
        event.stopPropagation()
        momentSelectRef.current(moment.id)
      })
      marker.append(content)
      map.appendChild(marker)
      momentMarkersRef.current.push(marker)
    }
    return () => {
      for (const marker of momentMarkersRef.current) marker.remove()
      momentMarkersRef.current = []
    }
  }, [map, moments, selectedMomentId, visibleMomentKey])

  // Continuous per-frame sync loop. Reads the authoritative playback state fresh
  // every animation frame: reveals the track up to the current time, moves the
  // pilot marker, and glides the camera onto the pilot plus any saved pan
  // offset — never touching heading/tilt/range, and standing down entirely
  // while the user is gesturing.
  // Existing map objects are mutated in place; nothing is recreated per frame.
  useEffect(() => {
    if (!map || !flight) return
    let rafId: number
    let lastTs: number | null = null
    let lastMarkerWrite: { lat: number; lng: number; altitude: number } | null = null
    let lastAltitudeText = ''

    const clearDropLines = () => {
      for (const line of dropLinesRef.current) line.polyline.remove()
      dropLinesRef.current = []
      lastDropLineTimeRef.current = Number.NEGATIVE_INFINITY
    }

    const updateReveal = (
      timeMs: number,
      tip: { lat: number; lng: number; altitude: number },
    ) => {
      const segments = trackRef.current
      if (segments.length === 0) return
      const reveal = revealRef.current

      let idx = reveal.idx
      while (idx < segments.length - 1 && segments[idx].endMs <= timeMs) idx++
      while (idx > 0 && segments[idx].startMs > timeMs) idx--

      if (idx > reveal.idx) {
        // Moved forward: fully reveal every segment we passed.
        for (let i = reveal.idx; i < idx; i++) {
          segments[i].polyline.path = segments[i].points
        }
      } else if (idx < reveal.idx) {
        // Scrubbed backward: hide every segment past the new position.
        for (let i = idx + 1; i <= reveal.idx; i++) {
          segments[i].polyline.path = [segments[i].points[0]]
        }
      }
      reveal.idx = idx

      if (timeMs !== reveal.lastTimeMs) {
        reveal.lastTimeMs = timeMs
        const active = segments[idx]
        if (timeMs >= active.endMs) {
          active.polyline.path = active.points
        } else {
          active.polyline.path = slicePointsUpTo(active.points, timeMs, tip)
        }
      }
    }

    const updateDropLines = (timeMs: number, pos: { lat: number; lng: number; altitude: number }) => {
      const maps3d = maps3dRef.current
      if (!maps3d) return
      if (!showDropCurtain) {
        clearDropLines()
        return
      }
      const activeSegment = trackRef.current[revealRef.current.idx]
      const activeColor = activeSegment?.polyline.strokeColor ?? MARKER_ACCENT_COLOR

      if (Math.abs(timeMs - lastDropLineTimeRef.current) >= DROP_LINE_INTERVAL_MS) {
        lastDropLineTimeRef.current = timeMs
        const polyline = new maps3d.Polyline3DElement({
          path: [
            { lat: pos.lat, lng: pos.lng, altitude: 0 },
            { lat: pos.lat, lng: pos.lng, altitude: pos.altitude },
          ],
          strokeColor: colorWithAlpha(activeColor, DROP_LINE_MAX_ALPHA),
          strokeWidth: DROP_LINE_WIDTH,
          altitudeMode: 'ABSOLUTE',
          drawsOccludedSegments: false,
        })
        polyline.setAttribute('data-drop-line', 'true')
        map.appendChild(polyline)
        dropLinesRef.current.push({ polyline, timeMs, color: activeColor })
      }

      const kept: DropLine[] = []
      for (const line of dropLinesRef.current) {
        const age = timeMs - line.timeMs
        if (age < 0 || age > DROP_LINE_LIFETIME_MS) {
          line.polyline.remove()
          continue
        }
        const alpha = DROP_LINE_MAX_ALPHA * (1 - age / DROP_LINE_LIFETIME_MS)
        line.polyline.strokeColor = colorWithAlpha(line.color, alpha)
        kept.push(line)
      }
      dropLinesRef.current = kept
    }

    const tick = (ts: number) => {
      rafId = requestAnimationFrame(tick)
      const dt = lastTs === null ? 16 : Math.min(ts - lastTs, 100)
      lastTs = ts

      const state = playbackStore.getState()
      if (state.flight !== flight) return

      const pos = interpolateFix(flight.fixes, state.currentTimeMs)

      updateReveal(state.currentTimeMs, pos)
      updateDropLines(state.currentTimeMs, pos)

      const markerMoved =
        !lastMarkerWrite ||
        Math.abs(pos.lat - lastMarkerWrite.lat) > WRITE_EPSILON_DEG ||
        Math.abs(pos.lng - lastMarkerWrite.lng) > WRITE_EPSILON_DEG ||
        Math.abs(pos.altitude - lastMarkerWrite.altitude) > WRITE_EPSILON_ALT_M
      if (markerMoved && pilotMarkerRef.current) {
        lastMarkerWrite = { lat: pos.lat, lng: pos.lng, altitude: pos.altitude }
        pilotMarkerRef.current.position = { lat: pos.lat, lng: pos.lng, altitude: pos.altitude }
      }
      const altitudeText = `${Math.round(pos.altitude)} m`
      if (altitudeText !== lastAltitudeText && altitudeLabelRef.current) {
        lastAltitudeText = altitudeText
        altitudeLabelRef.current.textContent = altitudeText
      }

      const cur = map.center
      if (!cur) {
        map.center = makePositionWithOffset(pos, followOffsetRef.current)
        return
      }

      const target = makePositionWithOffset(pos, followOffsetRef.current)
      const dLat = target.lat - cur.lat
      const dLng = target.lng - cur.lng
      const curAlt = cur.altitude ?? pos.altitude
      const dAlt = (target.altitude ?? pos.altitude) - curAlt
      const distDeg = Math.hypot(dLat, dLng)

      const g = gestureRef.current
      const now = performance.now()
      const gestureBusy =
        g.pointerDown ||
        now - g.lastPointerEnd < GESTURE_POINTER_GRACE_MS ||
        now - g.lastWheel < GESTURE_WHEEL_GRACE_MS
      if (gestureBusy) {
        followOffsetRef.current = makeOffsetFromPosition(cur, pos)
        return
      }
      if (isCameraAnimating()) return

      if (distDeg > SNAP_DISTANCE_DEG) {
        map.center = target
      } else if (distDeg > WRITE_EPSILON_DEG || Math.abs(dAlt) > WRITE_EPSILON_ALT_M) {
        const alpha = 1 - Math.exp(-dt / SETTLE_TAU_MS)
        map.center = {
          lat: cur.lat + dLat * alpha,
          lng: cur.lng + dLng * alpha,
          altitude: curAlt + dAlt * alpha,
        }
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [map, flight, isCameraAnimating, showDropCurtain])

  const overlayError = status === 'error' ? scriptError : initError
  const showOverlay = status !== 'ready' || Boolean(initError)

  return (
    <div className="map3d-root">
      <div ref={containerRef} className="map3d-container" />
      <CameraControls map={map} markCameraAnimation={markCameraAnimation} />
      {showOverlay && (
        <div className="map3d-status-overlay" role="status">
          {overlayError ? (
            <p className="map3d-status-error">{overlayError}</p>
          ) : (
            <p>Loading 3D map…</p>
          )}
        </div>
      )}
    </div>
  )
}
