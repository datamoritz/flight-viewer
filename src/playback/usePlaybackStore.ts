import { useSyncExternalStore } from 'react'
import { playbackStore, type PlaybackState } from './store'

/**
 * Subscribes a component to a single slice of the authoritative playback state.
 * `selector` must return a primitive or a stable object reference (e.g. `flight`,
 * which only changes when a new file is loaded) so React can cheaply detect changes.
 */
export function usePlaybackStore<T>(selector: (state: PlaybackState) => T): T {
  return useSyncExternalStore(playbackStore.subscribe, () => selector(playbackStore.getState()))
}
