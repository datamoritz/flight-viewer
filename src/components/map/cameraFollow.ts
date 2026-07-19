import { useCallback, useEffect, useRef } from 'react'
import type { Map3DElement } from '../../types/maps3d'

export interface CameraAnimationGuard {
  /** Call immediately before starting a `map.flyCameraTo(...)` animation. */
  markCameraAnimation: (durationMillis: number) => void
  /**
   * True while a `flyCameraTo` animation we triggered is in flight.
   * Continuous per-frame follow should skip direct `map.center` writes during
   * this window — writing directly while an animation is running can cut it
   * short and cause a visible jump.
   */
  isCameraAnimating: () => boolean
}

const ANIMATION_TIMEOUT_BUFFER_MS = 500

/**
 * Follow mode is now purely explicit — controlled only by the "Explore
 * freely" / "Follow pilot" buttons, never inferred from camera gesture
 * events. (Earlier attempts to infer a "real user pan" from
 * `gmp-centerchange`/`gmp-headingchange`/etc. were abandoned: verified
 * empirically against the live API, pan/orbit/zoom are indistinguishable via
 * those events, and flyCameraTo's actual resulting center is a terrain
 * ground-point rather than the literal requested target, so nothing about
 * "was this our write" can be reliably inferred from them either.)
 *
 * This hook now only tracks whether a `flyCameraTo` animation *we* triggered
 * is still in flight, purely so continuous per-frame direct `center` writes
 * (driven by the main follow loop) know to stand down and not interrupt it.
 */
export function useCameraAnimationGuard(map: Map3DElement | null): CameraAnimationGuard {
  const suppressedRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!map) return
    const onAnimationEnd = () => {
      suppressedRef.current = false
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
    map.addEventListener('gmp-animationend', onAnimationEnd)
    return () => map.removeEventListener('gmp-animationend', onAnimationEnd)
  }, [map])

  const markCameraAnimation = useCallback((durationMillis: number) => {
    suppressedRef.current = true
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    // Fallback in case gmp-animationend doesn't fire for some reason.
    timeoutRef.current = setTimeout(() => {
      suppressedRef.current = false
      timeoutRef.current = null
    }, durationMillis + ANIMATION_TIMEOUT_BUFFER_MS)
  }, [])

  const isCameraAnimating = useCallback(() => suppressedRef.current, [])

  return { markCameraAnimation, isCameraAnimating }
}
