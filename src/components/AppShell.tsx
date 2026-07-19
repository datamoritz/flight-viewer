import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Map3DView } from './map/Map3DView'
import { AltitudeProfile } from './profile/AltitudeProfile'
import { PlaybackControls } from './controls/PlaybackControls'
import { UploadControl } from './controls/UploadControl'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { playbackStore } from '../playback/store'
import { loadIgcFile } from '../igc/loadIgcFile'
import { useGoogleBannerOffset } from './useGoogleBannerOffset'

export interface AppShellProps {
  apiKey: string | undefined
}

export function AppShell({ apiKey }: AppShellProps) {
  useGoogleBannerOffset()
  const flight = usePlaybackStore((s) => s.flight)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const dragCounterRef = useRef(0)

  const handleFile = useCallback(async (file: File) => {
    try {
      const parsed = await loadIgcFile(file)
      playbackStore.loadFlight(parsed)
      setUploadError(null)
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Could not read this file. Please choose a valid IGC file.',
      )
    }
  }, [])

  // Space bar play/pause, ignored while focus is inside an input/textarea/select/editable element.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space') return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const isTypingTarget =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target?.isContentEditable)
      if (isTypingTarget) return
      event.preventDefault()
      playbackStore.togglePlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault()
    dragCounterRef.current += 1
    if (event.dataTransfer.types.includes('Files')) setIsDragActive(true)
  }
  const onDragOver = (event: DragEvent) => {
    event.preventDefault()
  }
  const onDragLeave = (event: DragEvent) => {
    event.preventDefault()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setIsDragActive(false)
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    dragCounterRef.current = 0
    setIsDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  return (
    <div
      className="app-shell"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="map-area">
        <Map3DView apiKey={apiKey} />

        <div className="control-cluster">
          <UploadControl onFile={handleFile} />
          <PlaybackControls />
        </div>

        {!flight && (
          <div className="empty-state">
            <div className="empty-state-card">
              <h1>Paragliding Flight Viewer</h1>
              <p>
                Drag and drop an IGC file anywhere on this window, or use{' '}
                <strong>Upload IGC</strong> above to explore a flight in 3D.
              </p>
            </div>
          </div>
        )}

        {uploadError && (
          <div className="error-banner" role="alert">
            <span>{uploadError}</span>
            <button type="button" onClick={() => setUploadError(null)} aria-label="Dismiss error">
              ✕
            </button>
          </div>
        )}

        {isDragActive && (
          <div className="drag-overlay" aria-hidden="true">
            <p>Drop IGC file to load flight</p>
          </div>
        )}

        {/* Inset from the left so Google's attribution badge, pinned to the map's own
            bottom-left corner, always stays visible and uncovered by the translucent panel. */}
        <AltitudeProfile />
      </div>
    </div>
  )
}
