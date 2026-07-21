import { useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { usePlaybackStore } from '../../playback/usePlaybackStore'
import { playbackStore } from '../../playback/store'
import { useResizablePanel } from './useResizablePanel'
import { formatLocalClock } from '../../utils/time'
import { timeZoneForCoordinates } from '../../utils/locationMetadata'
import type { Fix, ParsedFlight } from '../../igc/types'
import type { FlightMoment } from '../../data/types'

const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 240
const PADDING_TOP = 16
const PADDING_BOTTOM = 28
const PADDING_LEFT = 52
const PADDING_RIGHT = 16
const CHART_MAX_POINTS = 1200
const GRID_STEP_M = 500

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function decimateForChart(fixes: Fix[]): Fix[] {
  if (fixes.length <= CHART_MAX_POINTS) return fixes
  const stride = Math.ceil(fixes.length / CHART_MAX_POINTS)
  const out = fixes.filter((_, i) => i % stride === 0)
  if (out[out.length - 1] !== fixes[fixes.length - 1]) out.push(fixes[fixes.length - 1])
  return out
}

interface ChartGeometry {
  xForTime: (timeMs: number) => number
  yForAltitude: (altitude: number) => number
  linePoints: string
  areaPoints: string
  /** Altitude levels (in metres) at which to draw a horizontal gridline, every GRID_STEP_M. */
  gridLevels: number[]
}

function buildGeometry(flight: ParsedFlight): ChartGeometry {
  const points = decimateForChart(flight.fixes)
  const { startTimeMs, endTimeMs } = flight
  const timeSpan = Math.max(1, endTimeMs - startTimeMs)

  // Snap the altitude domain to whole 500 m boundaries so gridlines land on
  // round numbers (0, 500, 1000, …), with one step of headroom above/below.
  const minAltitude = Math.floor(flight.minAltitude / GRID_STEP_M) * GRID_STEP_M - GRID_STEP_M
  const maxAltitude = Math.ceil(flight.maxAltitude / GRID_STEP_M) * GRID_STEP_M + GRID_STEP_M
  const span = maxAltitude - minAltitude

  const xForTime = (timeMs: number) =>
    PADDING_LEFT +
    ((timeMs - startTimeMs) / timeSpan) * (VIEW_WIDTH - PADDING_LEFT - PADDING_RIGHT)

  const yForAltitude = (altitude: number) =>
    VIEW_HEIGHT -
    PADDING_BOTTOM -
    ((altitude - minAltitude) / span) * (VIEW_HEIGHT - PADDING_TOP - PADDING_BOTTOM)

  const linePoints = points.map((f) => `${xForTime(f.timeMs)},${yForAltitude(f.altitude)}`).join(' ')

  const baseline = VIEW_HEIGHT - PADDING_BOTTOM
  const areaPoints = `${PADDING_LEFT},${baseline} ${linePoints} ${xForTime(points[points.length - 1].timeMs)},${baseline}`

  const gridLevels: number[] = []
  for (let alt = minAltitude; alt <= maxAltitude; alt += GRID_STEP_M) {
    // Skip the very top/bottom headroom lines so the chart isn't boxed in.
    if (alt > minAltitude && alt < maxAltitude) gridLevels.push(alt)
  }

  return { xForTime, yForAltitude, linePoints, areaPoints, gridLevels }
}

export interface AltitudeProfileProps {
  moments: FlightMoment[]
  selectedMomentId: string | null
  onSelectMoment: (momentId: string) => void
}

export function AltitudeProfile({ moments, selectedMomentId, onSelectMoment }: AltitudeProfileProps) {
  const flight = usePlaybackStore((s) => s.flight)
  const timeZone = flight ? timeZoneForCoordinates(flight.fixes[0].lat, flight.fixes[0].lng) : 'UTC'
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs)
  const { height, onHandlePointerDown } = useResizablePanel()
  const svgRef = useRef<SVGSVGElement>(null)
  const isScrubbingRef = useRef(false)

  const geometry = useMemo(() => (flight ? buildGeometry(flight) : null), [flight])

  const staticChart = useMemo(() => {
    if (!flight || !geometry) return null
    return (
      <g>
        <polygon points={geometry.areaPoints} className="altitude-area" />
        <polyline points={geometry.linePoints} className="altitude-line" />
      </g>
    )
  }, [flight, geometry])

  if (!flight || !geometry) {
    return null
  }

  const timeToMs = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return currentTimeMs
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    return flight.startTimeMs + ratio * (flight.endTimeMs - flight.startTimeMs)
  }

  const beginScrub = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.preventDefault()
    isScrubbingRef.current = true
    playbackStore.seek(timeToMs(event.clientX))

    const onMove = (e: PointerEvent) => {
      if (!isScrubbingRef.current) return
      playbackStore.seek(timeToMs(e.clientX))
    }
    const onUp = () => {
      isScrubbingRef.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const cursorX = geometry.xForTime(currentTimeMs)
  const timeTickCount = 5
  const timeTicks = Array.from({ length: timeTickCount }, (_, i) => {
    const t = flight.startTimeMs + (i / (timeTickCount - 1)) * (flight.endTimeMs - flight.startTimeMs)
    return { timeMs: t, x: geometry.xForTime(t) }
  })
  const altGridlines = geometry.gridLevels.map((altitude) => ({
    altitude,
    y: geometry.yForAltitude(altitude),
  }))
  return (
    <div className="altitude-panel" style={{ height }}>
      <button
        type="button"
        className="altitude-panel-handle"
        onPointerDown={onHandlePointerDown}
        aria-label="Resize altitude profile panel"
      />
      <div className="altitude-panel-header">
        <span>Altitude profile</span>
      </div>
      <div className="altitude-chart-stage">
        <svg
          ref={svgRef}
          className="altitude-svg"
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          role="slider"
          aria-label="Altitude profile — click or drag to jump to a point in the flight"
          aria-valuemin={flight.startTimeMs}
          aria-valuemax={flight.endTimeMs}
          aria-valuenow={currentTimeMs}
          aria-valuetext={formatLocalClock(currentTimeMs, timeZone)}
          tabIndex={0}
          onPointerDown={beginScrub}
        >
          {altGridlines.map((tick) => (
            <line
              key={tick.altitude}
              x1={PADDING_LEFT}
              x2={VIEW_WIDTH - PADDING_RIGHT}
              y1={tick.y}
              y2={tick.y}
              className="altitude-gridline"
            />
          ))}

          {staticChart}

          <line
            x1={cursorX}
            x2={cursorX}
            y1={PADDING_TOP}
            y2={VIEW_HEIGHT - PADDING_BOTTOM}
            className="altitude-cursor"
          />
        </svg>
        <div className="altitude-label-layer" aria-hidden="true">
          {altGridlines.map((tick) => (
            <span
              key={tick.altitude}
              className="altitude-axis-label altitude-axis-label-y"
              style={{ left: `${(PADDING_LEFT / VIEW_WIDTH) * 100}%`, top: `${(tick.y / VIEW_HEIGHT) * 100}%` }}
            >
              {tick.altitude.toLocaleString()} m
            </span>
          ))}
          {timeTicks.map((tick) => (
            <span
              key={tick.timeMs}
              className="altitude-axis-label altitude-axis-label-x"
              style={{ left: `${(clamp(tick.x, PADDING_LEFT + 20, VIEW_WIDTH - PADDING_RIGHT - 20) / VIEW_WIDTH) * 100}%` }}
            >
              {formatLocalClock(tick.timeMs, timeZone, false)}
            </span>
          ))}
        </div>
        {moments.map((moment) => {
          const x = (geometry.xForTime(moment.timeMs) / VIEW_WIDTH) * 100
          const y = (geometry.yForAltitude(moment.altitude) / VIEW_HEIGHT) * 100
          return (
            <button
              key={moment.id}
              type="button"
              className={`altitude-moment-marker ${moment.id === selectedMomentId ? 'is-selected' : ''}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              onPointerDown={(event) => {
                event.stopPropagation()
                onSelectMoment(moment.id)
              }}
              aria-label="Flight comment"
            />
          )
        })}
      </div>
    </div>
  )
}
