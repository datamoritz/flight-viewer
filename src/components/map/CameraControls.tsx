import { useEffect, useRef } from 'react'
import type { Map3DElement } from '../../types/maps3d'

const REPEAT_INTERVAL_MS = 50
const HEADING_STEP_DEG = 2.5
const TILT_STEP_DEG = 1.2
const RANGE_FACTOR = 0.955
const MIN_TILT = 0
const MAX_TILT = 88
const MIN_RANGE = 150
const MAX_RANGE = 30_000_000

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export interface CameraControlsProps {
  map: Map3DElement | null
  /** Suppresses the follow loop's center writes for the duration of a camera animation. */
  markCameraAnimation: (durationMillis: number) => void
}

interface HoldButtonProps {
  label: string
  title: string
  onStep: () => void
  children: React.ReactNode
}

/**
 * A control button that fires once on press and then repeats while held,
 * giving smooth continuous camera motion without requiring drag gestures.
 */
function HoldButton({ label, title, onStep, children }: HoldButtonProps) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => stop, [])

  return (
    <button
      type="button"
      className="camera-control-button"
      aria-label={label}
      title={title}
      onPointerDown={(e) => {
        e.preventDefault()
        onStep()
        stop()
        timerRef.current = setInterval(onStep, REPEAT_INTERVAL_MS)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

/**
 * Always-visible on-screen camera controls (rotate, tilt, zoom, face north),
 * in the spirit of the reference viewer's navigation widget. These adjust
 * heading/tilt/range directly — never `center` — so they compose cleanly with
 * the always-follow camera and work regardless of mouse/trackpad gesture
 * support.
 */
export function CameraControls({ map, markCameraAnimation }: CameraControlsProps) {
  if (!map) return null

  const rotate = (direction: 1 | -1) => () => {
    map.heading = ((map.heading ?? 0) + direction * HEADING_STEP_DEG + 360) % 360
  }
  const tilt = (direction: 1 | -1) => () => {
    map.tilt = clamp((map.tilt ?? 0) + direction * TILT_STEP_DEG, MIN_TILT, MAX_TILT)
  }
  const zoom = (direction: 1 | -1) => () => {
    const factor = direction === 1 ? RANGE_FACTOR : 1 / RANGE_FACTOR
    map.range = clamp((map.range ?? 1000) * factor, MIN_RANGE, MAX_RANGE)
  }
  const faceNorth = () => {
    const durationMillis = 500
    markCameraAnimation(durationMillis)
    map.flyCameraTo({
      endCamera: {
        center: map.center ?? { lat: 0, lng: 0, altitude: 0 },
        heading: 0,
        tilt: map.tilt,
        range: map.range,
      },
      durationMillis,
    })
  }

  return (
    <div className="camera-controls" role="group" aria-label="Camera controls">
      <button type="button" className="camera-control-button" aria-label="Face north" title="Face north" onClick={faceNorth}>
        <span className="compass-icon" aria-hidden="true">N</span>
      </button>
      <HoldButton label="Rotate left" title="Rotate left (hold to keep rotating)" onStep={rotate(1)}>
        ↶
      </HoldButton>
      <HoldButton label="Rotate right" title="Rotate right (hold to keep rotating)" onStep={rotate(-1)}>
        ↷
      </HoldButton>
      <HoldButton label="Tilt up" title="Tilt toward horizon (hold to keep tilting)" onStep={tilt(1)}>
        ↑
      </HoldButton>
      <HoldButton label="Tilt down" title="Tilt toward top-down (hold to keep tilting)" onStep={tilt(-1)}>
        ↓
      </HoldButton>
      <HoldButton label="Zoom in" title="Zoom in (hold to keep zooming)" onStep={zoom(1)}>
        +
      </HoldButton>
      <HoldButton label="Zoom out" title="Zoom out (hold to keep zooming)" onStep={zoom(-1)}>
        −
      </HoldButton>
    </div>
  )
}
