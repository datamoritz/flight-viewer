import type { ParsedFlight } from '../igc/types'

export const SPEED_OPTIONS = [1, 5, 10, 30, 60] as const
export type Speed = (typeof SPEED_OPTIONS)[number]
export const DEFAULT_SPEED: Speed = 30

export interface PlaybackState {
  flight: ParsedFlight | null
  currentTimeMs: number
  isPlaying: boolean
  speed: Speed
}

const initialState: PlaybackState = {
  flight: null,
  currentTimeMs: 0,
  isPlaying: false,
  speed: DEFAULT_SPEED,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Pure reducer for advancing playback by `realDtMs` of wall-clock time.
 * Exported (and kept side-effect free) so end-of-flight behavior is directly
 * testable without touching requestAnimationFrame/timers.
 */
export function advancePlaybackTime(state: PlaybackState, realDtMs: number): PlaybackState {
  if (!state.isPlaying || !state.flight || realDtMs <= 0) return state

  const nextTimeMs = state.currentTimeMs + realDtMs * state.speed
  const { endTimeMs } = state.flight

  if (nextTimeMs >= endTimeMs) {
    return { ...state, currentTimeMs: endTimeMs, isPlaying: false }
  }
  return { ...state, currentTimeMs: nextTimeMs }
}

type Listener = () => void

function createPlaybackStore() {
  let state: PlaybackState = initialState
  const listeners = new Set<Listener>()
  let rafId: number | null = null
  let lastFrameTime: number | null = null

  function setState(updater: (prev: PlaybackState) => PlaybackState) {
    const next = updater(state)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    lastFrameTime = null
  }

  function tick(now: number) {
    if (lastFrameTime === null) lastFrameTime = now
    const dt = now - lastFrameTime
    lastFrameTime = now
    setState((prev) => advancePlaybackTime(prev, dt))
    if (state.isPlaying) {
      rafId = requestAnimationFrame(tick)
    } else {
      stopLoop()
    }
  }

  function startLoop() {
    if (rafId !== null) return
    lastFrameTime = null
    rafId = requestAnimationFrame(tick)
  }

  return {
    getState(): PlaybackState {
      return state
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    loadFlight(flight: ParsedFlight) {
      stopLoop()
      setState(() => ({
        flight,
        currentTimeMs: flight.startTimeMs,
        isPlaying: false,
        speed: DEFAULT_SPEED,
      }))
    },
    play() {
      if (!state.flight) return
      setState((prev) => {
        if (prev.currentTimeMs >= prev.flight!.endTimeMs) {
          return { ...prev, currentTimeMs: prev.flight!.startTimeMs, isPlaying: true }
        }
        return { ...prev, isPlaying: true }
      })
      startLoop()
    },
    pause() {
      setState((prev) => ({ ...prev, isPlaying: false }))
      stopLoop()
    },
    togglePlay() {
      if (state.isPlaying) this.pause()
      else this.play()
    },
    seek(timeMs: number) {
      if (!state.flight) return
      const clamped = clamp(timeMs, state.flight.startTimeMs, state.flight.endTimeMs)
      setState((prev) => ({ ...prev, currentTimeMs: clamped }))
    },
    jumpToStart() {
      if (!state.flight) return
      setState((prev) => ({ ...prev, currentTimeMs: prev.flight!.startTimeMs }))
    },
    setSpeed(speed: Speed) {
      setState((prev) => ({ ...prev, speed }))
    },
  }
}

export const playbackStore = createPlaybackStore()
