import { describe, expect, it } from 'vitest'
import { advancePlaybackTime, DEFAULT_SPEED, type PlaybackState } from './store'
import type { ParsedFlight } from '../igc/types'

function makeFlight(overrides: Partial<ParsedFlight> = {}): ParsedFlight {
  return {
    pilotName: 'Pilot',
    fixes: [],
    simplifiedFixes: [],
    startTimeMs: 0,
    endTimeMs: 10_000,
    minAltitude: 0,
    maxAltitude: 100,
    ...overrides,
  }
}

function makeState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    flight: makeFlight(),
    currentTimeMs: 0,
    isPlaying: true,
    speed: DEFAULT_SPEED,
    ...overrides,
  }
}

describe('advancePlaybackTime', () => {
  it('advances currentTimeMs by realDtMs * speed', () => {
    const state = makeState({ currentTimeMs: 1000, speed: 10 })
    const next = advancePlaybackTime(state, 100)
    expect(next.currentTimeMs).toBe(1000 + 100 * 10)
    expect(next.isPlaying).toBe(true)
  })

  it('is a no-op when not playing', () => {
    const state = makeState({ isPlaying: false, currentTimeMs: 1000 })
    const next = advancePlaybackTime(state, 500)
    expect(next).toBe(state)
  })

  it('is a no-op when no flight is loaded', () => {
    const state = makeState({ flight: null })
    const next = advancePlaybackTime(state, 500)
    expect(next).toBe(state)
  })

  it('is a no-op for zero or negative dt', () => {
    const state = makeState()
    expect(advancePlaybackTime(state, 0)).toBe(state)
    expect(advancePlaybackTime(state, -16)).toBe(state)
  })

  it('clamps to the flight end and stops playback when the end is reached', () => {
    const state = makeState({ currentTimeMs: 9900, speed: 10 })
    const next = advancePlaybackTime(state, 100) // would overshoot to 10900
    expect(next.currentTimeMs).toBe(10_000)
    expect(next.isPlaying).toBe(false)
  })

  it('stops cleanly exactly at the last fix, never overshooting', () => {
    const state = makeState({ currentTimeMs: 9999, speed: 60 })
    const next = advancePlaybackTime(state, 1000)
    expect(next.currentTimeMs).toBe(10_000)
    expect(next.currentTimeMs).toBeLessThanOrEqual(state.flight!.endTimeMs)
  })
})
