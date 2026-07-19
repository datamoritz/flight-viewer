import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export const MIN_PANEL_HEIGHT = 140
export const MAX_PANEL_HEIGHT = 440
const DEFAULT_PANEL_HEIGHT = 220

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Drag-to-resize logic for the altitude panel's top handle, clamped to a min/max height. */
export function useResizablePanel() {
  const [height, setHeight] = useState(DEFAULT_PANEL_HEIGHT)
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null)

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault()
      dragState.current = { startY: event.clientY, startHeight: height }

      const onMove = (e: PointerEvent) => {
        if (!dragState.current) return
        // Handle sits at the top of a bottom-anchored panel: dragging up grows it.
        const delta = dragState.current.startY - e.clientY
        setHeight(clamp(dragState.current.startHeight + delta, MIN_PANEL_HEIGHT, MAX_PANEL_HEIGHT))
      }
      const onUp = () => {
        dragState.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [height],
  )

  return { height, onHandlePointerDown, minHeight: MIN_PANEL_HEIGHT, maxHeight: MAX_PANEL_HEIGHT }
}
