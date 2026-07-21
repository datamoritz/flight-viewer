import { usePlaybackStore } from '../../playback/usePlaybackStore'
import { playbackStore, SPEED_OPTIONS, type Speed } from '../../playback/store'
import { formatLocalClock, localTzAbbrev } from '../../utils/time'
import { timeZoneForCoordinates } from '../../utils/locationMetadata'

export function PlaybackControls() {
  const flight = usePlaybackStore((s) => s.flight)
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs)
  const speed = usePlaybackStore((s) => s.speed)

  const disabled = !flight
  const timeZone = flight ? timeZoneForCoordinates(flight.fixes[0].lat, flight.fixes[0].lng) : null
  const tz = timeZone ? localTzAbbrev(currentTimeMs, timeZone) : ''

  return (
    <div className="playback-controls" role="group" aria-label="Playback controls">
      <button
        type="button"
        className="icon-button"
        onClick={() => playbackStore.jumpToStart()}
        disabled={disabled}
        aria-label="Jump to start"
        title="Jump to start"
      >
        <svg className="playback-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5v14M19 6l-10 6 10 6z" />
        </svg>
      </button>

      <button
        type="button"
        className="icon-button icon-button-primary"
        onClick={() => playbackStore.togglePlay()}
        disabled={disabled}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        title={isPlaying ? 'Pause (space)' : 'Play (space)'}
      >
        {isPlaying ? (
          <svg className="playback-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 6v12M16 6v12" />
          </svg>
        ) : (
          <svg className="playback-icon playback-icon-play" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5l11 7-11 7z" />
          </svg>
        )}
      </button>

      <span className="playback-time" aria-live="off">
        {flight && timeZone ? `${formatLocalClock(currentTimeMs, timeZone)} ${tz}` : '--:--:--'}
      </span>

      <label className="playback-speed">
        <span className="visually-hidden">Playback speed</span>
        <select
          value={speed}
          disabled={disabled}
          onChange={(e) => playbackStore.setSpeed(Number(e.target.value) as Speed)}
        >
          {SPEED_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}×
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
