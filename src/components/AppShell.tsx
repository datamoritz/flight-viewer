import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Map3DView } from './map/Map3DView'
import { AltitudeProfile } from './profile/AltitudeProfile'
import { PlaybackControls } from './controls/PlaybackControls'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { playbackStore } from '../playback/store'
import { parseIgc } from '../igc/parser'
import { useGoogleBannerOffset } from './useGoogleBannerOffset'
import { FlightLibraryPanel } from './library/FlightLibraryPanel'
import { MomentDetailCard } from './moments/MomentDetailCard'
import { createFlightRepository } from '../data/createFlightRepository'
import { COMMENT_MAX_LENGTH, IGC_MAX_BYTES, PHOTO_MAX_BYTES, PHOTO_TOTAL_MAX_BYTES_PER_FLIGHT } from '../data/config'
import { anchorForTime } from '../data/anchor'
import { sha256Hex } from '../data/hash'
import { readPhotoExif } from '../data/exif'
import { matchPhotoToFlight } from '../data/photoMatching'
import { createImageThumbnail } from '../data/thumbnails'
import type { FlightMoment, FlightPhoto, FlightSummary } from '../data/types'
import { GoogleLocationLookupService } from '../services/locationLookup'
import { cumulativeTrackDistanceMeters, roughOptimizedFreeDistanceMeters } from '../utils/geo'

export interface AppShellProps {
  apiKey: string | undefined
  dataApiUrl: string | undefined
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
}

function isIgcFile(file: File): boolean {
  return /\.igc$/i.test(file.name) || file.type === 'text/plain' || file.type === 'application/octet-stream'
}

export function AppShell({ apiKey, dataApiUrl }: AppShellProps) {
  useGoogleBannerOffset()
  const flight = usePlaybackStore((s) => s.flight)
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs)
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const repository = useMemo(() => createFlightRepository(dataApiUrl), [dataApiUrl])
  const locationLookup = useMemo(() => new GoogleLocationLookupService(apiKey), [apiKey])
  const [showDropCurtain, setShowDropCurtain] = useState(true)
  const [trackStrokeWidth, setTrackStrokeWidth] = useState(2)
  const [showTrackStyle, setShowTrackStyle] = useState(false)
  const [isFlightsOpen, setIsFlightsOpen] = useState(true)
  const [hasLoadedFlights, setHasLoadedFlights] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [flights, setFlights] = useState<FlightSummary[]>([])
  const [activeFlightId, setActiveFlightId] = useState<string | null>(null)
  const [moments, setMoments] = useState<FlightMoment[]>([])
  const [photos, setPhotos] = useState<FlightPhoto[]>([])
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null)
  const [autoDismissMomentId, setAutoDismissMomentId] = useState<string | null>(null)
  const [photoOffsets, setPhotoOffsets] = useState<Record<string, number>>({})
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const previousPlaybackTimeRef = useRef<number | null>(null)

  const refreshFlights = useCallback(async () => {
    setFlights(await repository.listFlights())
  }, [repository])

  const loadStoredFlight = useCallback(
    async (flightId: string) => {
      const record = await repository.getFlight(flightId)
      if (!record) throw new Error('Flight not found.')
      const parsed = parseIgc(record.igcText)
      playbackStore.loadFlight(parsed)
      setActiveFlightId(record.id)
      setMoments(await repository.listMoments(record.id))
      setPhotos(await repository.listPhotos(record.id))
      setSelectedMomentId(null)
      setAutoDismissMomentId(null)
      previousPlaybackTimeRef.current = parsed.startTimeMs
      setUploadError(null)
    },
    [repository],
  )

  useEffect(() => {
    void refreshFlights().catch((err) =>
      setUploadError(err instanceof Error ? err.message : 'Could not load the flight library.'),
    ).finally(() => setHasLoadedFlights(true))
  }, [refreshFlights])

  const handleFile = useCallback(async (file: File) => {
    try {
      setIsBusy(true)
      if (file.size > IGC_MAX_BYTES) throw new Error('IGC file is too large. Maximum size is 10 MB.')
      const text = await file.text()
      const hash = await sha256Hex(text)
      const duplicate = await repository.findFlightByHash(hash)
      if (duplicate) {
        await loadStoredFlight(duplicate.id)
        setIsFlightsOpen(true)
        throw new Error('This IGC is already in the flight library. The existing flight was opened.')
      }
      const parsed = parseIgc(text)
      const firstFix = parsed.fixes[0]
      const location = await locationLookup.lookupStartLocation(firstFix)
      const input = {
        hash,
        title: file.name.replace(/\.[^.]+$/, '') || file.name,
        originalFilename: file.name,
        pilotName: parsed.pilotName,
        startTimeMs: parsed.startTimeMs,
        endTimeMs: parsed.endTimeMs,
        durationSeconds: Math.round((parsed.endTimeMs - parsed.startTimeMs) / 1000),
        minAltitude: parsed.minAltitude,
        maxAltitude: parsed.maxAltitude,
        totalDistanceMeters: cumulativeTrackDistanceMeters(parsed.fixes),
        optimizedDistanceMeters: roughOptimizedFreeDistanceMeters(parsed.fixes),
        startLat: firstFix.lat,
        startLng: firstFix.lng,
        startLocationLabel: location.label,
        startPlaceId: location.placeId,
        igcText: text,
      }
      const saved = await repository.createFlight(input)
      await refreshFlights()
      await loadStoredFlight(saved.id)
      setUploadError(null)
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Could not read this file. Please choose a valid IGC file.',
      )
    } finally {
      setIsBusy(false)
    }
  }, [loadStoredFlight, locationLookup, refreshFlights, repository])

  const handleRenameFlight = useCallback(
    async (record: FlightSummary, title: string) => {
      if (!title.trim()) return
      await repository.renameFlight(record.id, title)
      await refreshFlights()
    },
    [refreshFlights, repository],
  )

  const handleDeleteFlight = useCallback(
    async (record: FlightSummary) => {
      const ok = window.confirm(`Delete "${record.title}" and all comments, thumbnails, and original photos?`)
      if (!ok) return
      await repository.deleteFlight(record.id)
      await refreshFlights()
      if (record.id === activeFlightId) {
        setActiveFlightId(null)
        setMoments([])
        setPhotos([])
        setSelectedMomentId(null)
      }
    },
    [activeFlightId, refreshFlights, repository],
  )

  const addMoment = useCallback(async () => {
    if (!flight || !activeFlightId) return
    const anchor = anchorForTime(flight, currentTimeMs)
    const moment = await repository.createMoment({
      flightId: activeFlightId,
      ...anchor,
      commentText: '',
    })
    const nextMoments = await repository.listMoments(activeFlightId)
    setMoments(nextMoments)
    setAutoDismissMomentId(null)
    setSelectedMomentId(moment.id)
  }, [activeFlightId, currentTimeMs, flight, repository])

  const selectedMoment = moments.find((moment) => moment.id === selectedMomentId) ?? null

  const saveMomentComment = useCallback(
    async (commentText: string) => {
      if (!selectedMoment || !activeFlightId) return
      const cleaned = commentText.trim().slice(0, COMMENT_MAX_LENGTH)
      const updated = await repository.updateMoment(selectedMoment.id, { commentText: cleaned })
      setMoments((items) => items.map((item) => (item.id === updated.id ? updated : item)))
    },
    [activeFlightId, repository, selectedMoment],
  )

  const deleteMoment = useCallback(async () => {
    if (!selectedMoment || !activeFlightId) return
    await repository.deleteMoment(selectedMoment.id)
    setMoments(await repository.listMoments(activeFlightId))
    setPhotos(await repository.listPhotos(activeFlightId))
    setSelectedMomentId(null)
  }, [activeFlightId, repository, selectedMoment])

  const moveMomentToCurrentTime = useCallback(async () => {
    if (!selectedMoment || !flight || !activeFlightId) return
    const anchor = anchorForTime(flight, currentTimeMs)
    const updated = await repository.updateMoment(selectedMoment.id, anchor)
    setMoments((items) => items.map((item) => (item.id === updated.id ? updated : item)))
  }, [activeFlightId, currentTimeMs, flight, repository, selectedMoment])

  const uploadPhotos = useCallback(
    async (files: File[], offsetSeconds: number) => {
      if (!activeFlightId || !flight || !selectedMoment) return
      const existingBytes = photos.reduce((sum, photo) => sum + photo.sizeBytes, 0)
      const incomingBytes = files.reduce((sum, file) => sum + file.size, 0)
      if (existingBytes + incomingBytes > PHOTO_TOTAL_MAX_BYTES_PER_FLIGHT) {
        setUploadError('Photo storage limit exceeded for this flight. Maximum total is 100 MB.')
        return
      }
      for (const file of files) {
        if (file.size > PHOTO_MAX_BYTES) {
          setUploadError(`${file.name} is too large. Maximum photo size is 25 MB.`)
          return
        }
      }
      setPhotoOffsets((prev) => ({ ...prev, [activeFlightId]: offsetSeconds }))
      let firstCreatedMomentId: string | null = null
      for (const file of files) {
        const exif = await readPhotoExif(file)
        const placement = matchPhotoToFlight(flight, exif, selectedMoment.timeMs, offsetSeconds * 1000)
        const moment = await repository.createMoment({
          flightId: activeFlightId,
          ...placement.anchor,
          commentText: '',
        })
        firstCreatedMomentId ??= moment.id
        const thumbnailBlob = await createImageThumbnail(file)
        await repository.createPhoto({
          flightId: activeFlightId,
          momentId: moment.id,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          originalBlob: file,
          thumbnailBlob,
          exifTimeMs: exif.captureTimeMs,
          resolvedTimeMs: placement.anchor.timeMs,
          exifLat: exif.lat,
          exifLng: exif.lng,
          placementSource: placement.source,
        })
      }
      setMoments(await repository.listMoments(activeFlightId))
      setPhotos(await repository.listPhotos(activeFlightId))
      if (firstCreatedMomentId) setSelectedMomentId(firstCreatedMomentId)
      setUploadError(null)
    },
    [activeFlightId, flight, photos, repository, selectedMoment],
  )

  const movePhotoTime = useCallback(
    async (photoId: string, timeMs: number) => {
      if (!activeFlightId || !flight) return
      const photo = photos.find((item) => item.id === photoId)
      if (!photo) return
      const anchor = anchorForTime(flight, timeMs)
      await repository.updateMoment(photo.momentId, anchor)
      await repository.updatePhoto(photoId, { resolvedTimeMs: anchor.timeMs, placementSource: 'manual' })
      setMoments(await repository.listMoments(activeFlightId))
      setPhotos(await repository.listPhotos(activeFlightId))
      setSelectedMomentId(photo.momentId)
    },
    [activeFlightId, flight, photos, repository],
  )

  const deletePhoto = useCallback(
    async (photoId: string) => {
      if (!activeFlightId) return
      await repository.deletePhoto(photoId)
      setMoments(await repository.listMoments(activeFlightId))
      setPhotos(await repository.listPhotos(activeFlightId))
    },
    [activeFlightId, repository],
  )

  useEffect(() => {
    const previousTimeMs = previousPlaybackTimeRef.current
    previousPlaybackTimeRef.current = currentTimeMs
    if (!isPlaying || !activeFlightId || previousTimeMs === null || currentTimeMs < previousTimeMs) return
    const reached = moments.find(
      (moment) => moment.timeMs >= previousTimeMs && moment.timeMs <= currentTimeMs,
    )
    if (!reached) return
    setSelectedMomentId(reached.id)
    setAutoDismissMomentId(reached.id)
  }, [activeFlightId, currentTimeMs, isPlaying, moments])

  useEffect(() => {
    if (!autoDismissMomentId || selectedMomentId !== autoDismissMomentId) return
    const timeoutId = window.setTimeout(() => {
      setSelectedMomentId((current) => (current === autoDismissMomentId ? null : current))
      setAutoDismissMomentId(null)
    }, 10_000)
    return () => window.clearTimeout(timeoutId)
  }, [autoDismissMomentId, selectedMomentId])

  const selectComment = useCallback((momentId: string) => {
    const moment = moments.find((item) => item.id === momentId)
    if (moment) playbackStore.seek(moment.timeMs)
    setAutoDismissMomentId(null)
    setSelectedMomentId(momentId)
  }, [moments])

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
    const files = Array.from(event.dataTransfer.files ?? [])
    const imageFiles = files.filter(isImageFile)
    if (imageFiles.length > 0) {
      if (selectedMoment) {
        void uploadPhotos(imageFiles, activeFlightId ? (photoOffsets[activeFlightId] ?? 0) : 0)
      } else {
        setUploadError('Add or select a comment before dropping photos.')
      }
      return
    }
    const igcFile = files.find(isIgcFile)
    if (igcFile) void handleFile(igcFile)
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
        <Map3DView
          apiKey={apiKey}
          showDropCurtain={showDropCurtain}
          trackStrokeWidth={trackStrokeWidth}
          moments={moments}
          selectedMomentId={selectedMomentId}
          onSelectMoment={selectComment}
        />

        {flight && (
          <>
            <button
              type="button"
              className={`drop-curtain-toggle ${showDropCurtain ? 'is-active' : ''}`}
              onClick={() => setShowDropCurtain((value) => !value)}
              aria-pressed={showDropCurtain}
              aria-label={showDropCurtain ? 'Hide vertical position curtain' : 'Show vertical position curtain'}
              title={showDropCurtain ? 'Hide vertical position curtain' : 'Show vertical position curtain'}
            >
              <span className="drop-curtain-icon" aria-hidden="true" />
            </button>

            <div className="track-style-control">
              <button
                type="button"
                className={`track-style-toggle ${showTrackStyle ? 'is-active' : ''}`}
                onClick={() => setShowTrackStyle((value) => !value)}
                aria-expanded={showTrackStyle}
                aria-label="Adjust flight line thickness"
                title="Flight line thickness"
              >
                <span className="track-style-icon" aria-hidden="true" />
              </button>
              {showTrackStyle && (
                <div className="track-style-popover">
                  <label htmlFor="track-width">Flight line <output>{trackStrokeWidth}px</output></label>
                  <input id="track-width" type="range" min="1" max="8" step="0.5" value={trackStrokeWidth} onChange={(event) => setTrackStrokeWidth(Number(event.currentTarget.value))} />
                </div>
              )}
            </div>
          </>
        )}

        <div className="control-cluster">
          <button
            type="button"
            className="upload-button"
            onClick={() => setIsFlightsOpen((value) => !value)}
            aria-expanded={isFlightsOpen}
          >
            Flights
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".igc,.IGC,application/octet-stream,text/plain"
            className="visually-hidden"
            aria-label="Upload IGC file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleFile(file)
              event.target.value = ''
            }}
          />
          {flight && (
            <>
              <button type="button" className="upload-button" onClick={addMoment} disabled={!activeFlightId}>
                Add comment
              </button>
              <PlaybackControls />
            </>
          )}
        </div>

        {isFlightsOpen && (
          <FlightLibraryPanel
            flights={flights}
            activeFlightId={activeFlightId}
            repositoryMode={repository.mode}
            isBusy={isBusy}
            onRequestUpload={() => uploadInputRef.current?.click()}
            onSelect={(flightId) => {
              void loadStoredFlight(flightId)
                .then(() => setIsFlightsOpen(false))
                .catch((err) => setUploadError(err instanceof Error ? err.message : 'Could not load this flight.'))
            }}
            onRename={(record, title) =>
              void handleRenameFlight(record, title).catch((err) =>
                setUploadError(err instanceof Error ? err.message : 'Could not rename this flight.'),
              )
            }
            onDelete={(record) =>
              void handleDeleteFlight(record).catch((err) =>
                setUploadError(err instanceof Error ? err.message : 'Could not delete this flight.'),
              )
            }
            onClose={() => setIsFlightsOpen(false)}
          />
        )}

        {!flight && (
          <div className={`empty-state ${isFlightsOpen ? 'is-library-open' : ''}`}>
            <div className="empty-state-card">
              <span className="empty-state-kicker">Flight Viewer</span>
              <h1>
                {!hasLoadedFlights ? 'Loading your flights…' : flights.length > 0 ? 'Choose a flight to begin' : 'Add your first flight'}
              </h1>
              <p>
                {!hasLoadedFlights
                  ? 'Preparing your flight library.'
                  : 'Select a flight from the library or drag and drop an IGC file.'}
              </p>
              {hasLoadedFlights && flights.length === 0 && (
                <button type="button" className="empty-state-action" onClick={() => uploadInputRef.current?.click()}>
                  Choose IGC file
                </button>
              )}
            </div>
          </div>
        )}

        {!flight && <div className="opening-credit">Designed by Moritz Knödler</div>}

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
            <p>Drop file to upload</p>
          </div>
        )}

        {selectedMoment && (
          <MomentDetailCard
            moment={selectedMoment}
            photos={photos}
            offsetSeconds={activeFlightId ? (photoOffsets[activeFlightId] ?? 0) : 0}
            onOffsetChange={(offsetSeconds) => {
              if (activeFlightId) setPhotoOffsets((prev) => ({ ...prev, [activeFlightId]: offsetSeconds }))
            }}
            onSaveComment={(comment) =>
              void saveMomentComment(comment).catch((err) =>
                setUploadError(err instanceof Error ? err.message : 'Could not save this comment.'),
              )
            }
            onDelete={() =>
              void deleteMoment().catch((err) =>
                setUploadError(err instanceof Error ? err.message : 'Could not delete this comment.'),
              )
            }
            onDismiss={() => {
              setAutoDismissMomentId(null)
              setSelectedMomentId(null)
            }}
            onBeginEdit={() => setAutoDismissMomentId(null)}
            onMoveToCurrentTime={() =>
              void moveMomentToCurrentTime().catch((err) =>
                setUploadError(err instanceof Error ? err.message : 'Could not move this comment.'),
              )
            }
            onUploadPhotos={(files, offsetSeconds) =>
              void uploadPhotos(files, offsetSeconds).catch((err) =>
                setUploadError(err instanceof Error ? err.message : 'Could not upload these photos.'),
              )
            }
            onDeletePhoto={(photoId) =>
              void deletePhoto(photoId).catch((err) =>
                setUploadError(err instanceof Error ? err.message : 'Could not delete this photo.'),
              )
            }
            onMovePhotoTime={(photoId, timeMs) =>
              void movePhotoTime(photoId, timeMs).catch((err) =>
                setUploadError(err instanceof Error ? err.message : 'Could not move this photo.'),
              )
            }
          />
        )}
        {flight && (
          <AltitudeProfile
            moments={moments}
            selectedMomentId={selectedMomentId}
            onSelectMoment={selectComment}
          />
        )}
      </div>
    </div>
  )
}
