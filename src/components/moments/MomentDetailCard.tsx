import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { FlightMoment, FlightPhoto } from '../../data/types'
import { formatLocalClock } from '../../utils/time'
import { timeZoneForCoordinates } from '../../utils/locationMetadata'

const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif'

export interface MomentDetailCardProps {
  moment: FlightMoment
  photos: FlightPhoto[]
  offsetSeconds: number
  onOffsetChange: (offsetSeconds: number) => void
  onSaveComment: (commentText: string) => void
  onDelete: () => void
  onDismiss: () => void
  onBeginEdit: () => void
  onMoveToCurrentTime: () => void
  onUploadPhotos: (files: File[], offsetSeconds: number) => void
  onDeletePhoto: (photoId: string) => void
  onMovePhotoTime: (photoId: string, timeMs: number) => void
}

function CommentPhotoPreview({ photo, onOpen }: { photo: FlightPhoto; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const blob = photo.originalBlob ?? photo.thumbnailBlob
    if (!blob) {
      setUrl(photo.thumbnailUrl ?? photo.originalUrl ?? null)
      return
    }
    const nextUrl = URL.createObjectURL(blob)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [photo])

  return url ? <button type="button" className="moment-photo-preview" onClick={() => onOpen(url)} aria-label={`Enlarge ${photo.filename}`}><img src={url} alt={photo.filename} /></button> : null
}

function zonedParts(timeMs: number, timeZone: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(timeMs).map((part) => [part.type, part.value]))
}

function toDateTimeLocal(timeMs: number, timeZone: string): string {
  const p = zonedParts(timeMs, timeZone)
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

function fromDateTimeLocal(value: string, timeZone: string): number | null {
  const wallTime = Date.parse(`${value}:00Z`)
  if (!Number.isFinite(wallTime)) return null
  let guess = wallTime
  for (let i = 0; i < 2; i += 1) {
    const p = zonedParts(guess, timeZone)
    const representedWallTime = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second))
    guess -= representedWallTime - wallTime
  }
  return guess
}

function formatTime(timeMs: number | undefined, timeZone: string): string {
  if (timeMs === undefined) return 'No EXIF time'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  }).format(timeMs)
}

function PhotoRow({
  photo,
  onDelete,
  onMovePhotoTime,
  onOpen,
  timeZone,
}: {
  photo: FlightPhoto
  onDelete: () => void
  onMovePhotoTime: (timeMs: number) => void
  onOpen: (url: string) => void
  timeZone: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const blob = photo.originalBlob ?? photo.thumbnailBlob
    if (!blob) {
      setUrl(photo.thumbnailUrl ?? photo.originalUrl ?? null)
      return
    }
    const nextUrl = URL.createObjectURL(blob)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [photo])

  return (
    <div className="moment-photo-row">
      {url ? <button type="button" className="moment-photo-preview" onClick={() => onOpen(url)} aria-label={`Enlarge ${photo.filename}`}><img src={url} alt={photo.filename} /></button> : <div className="moment-photo-missing">No preview</div>}
      <div className="moment-photo-row-main">
        <strong>{photo.filename}</strong>
        <span>Detected: {formatTime(photo.exifTimeMs, timeZone)}</span>
        <label>
          Placed time
          <input
            type="datetime-local"
            value={toDateTimeLocal(photo.resolvedTimeMs, timeZone)}
            onChange={(event) => {
              const next = fromDateTimeLocal(event.currentTarget.value, timeZone)
              if (next !== null) onMovePhotoTime(next)
            }}
          />
        </label>
      </div>
      <button type="button" onClick={onDelete} aria-label={`Delete ${photo.filename}`}>
        Delete
      </button>
    </div>
  )
}

export function MomentDetailCard({
  moment,
  photos,
  offsetSeconds,
  onOffsetChange,
  onSaveComment,
  onDelete,
  onDismiss,
  onBeginEdit,
  onMoveToCurrentTime,
  onUploadPhotos,
  onDeletePhoto,
  onMovePhotoTime,
}: MomentDetailCardProps) {
  const momentPhotos = useMemo(() => photos.filter((photo) => photo.momentId === moment.id), [moment.id, photos])
  const [comment, setComment] = useState(moment.commentText ?? '')
  const [isEditing, setIsEditing] = useState(false)
  const [isDropActive, setIsDropActive] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = sessionStorage.getItem('flight-viewer-comment-position')
      return saved ? JSON.parse(saved) as { x: number; y: number } : null
    } catch { return null }
  })
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cardStyle: CSSProperties | undefined = position
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
    : undefined
  const beginMove = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button, input, textarea')) return
    const card = event.currentTarget.closest<HTMLElement>('.moment-detail-card')
    if (!card) return
    const rect = card.getBoundingClientRect()
    dragRef.current = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveCard = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const x = Math.max(8, Math.min(window.innerWidth - 220, event.clientX - drag.dx))
    const y = Math.max(8, Math.min(window.innerHeight - 100, event.clientY - drag.dy))
    setPosition({ x, y })
  }
  const endMove = () => {
    dragRef.current = null
  }

  const lightbox = lightboxUrl ? createPortal((
    <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="Enlarged flight photo" onClick={() => setLightboxUrl(null)}>
      <button type="button" aria-label="Close enlarged photo">×</button>
      <img src={lightboxUrl} alt="Enlarged flight attachment" onClick={(event) => event.stopPropagation()} />
    </div>
  ), document.body) : null

  useEffect(() => {
    const isEmptyMoment = !(moment.commentText ?? '').trim() && momentPhotos.length === 0
    setComment(moment.commentText ?? '')
    setIsEditing(isEmptyMoment)
  }, [moment, momentPhotos.length])

  useEffect(() => {
    if (position) sessionStorage.setItem('flight-viewer-comment-position', JSON.stringify(position))
  }, [position])

  const uploadDropped = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDropActive(false)
    const files = Array.from(event.dataTransfer.files ?? []).filter((file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))
    if (files.length > 0) onUploadPhotos(files, offsetSeconds)
  }

  const onDrag = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDropActive(true)
  }

  const title = formatLocalClock(moment.timeMs, timeZoneForCoordinates(moment.lat, moment.lng))
  const momentTimeZone = timeZoneForCoordinates(moment.lat, moment.lng)

  if (!isEditing) {
    return (
      <section
        className="moment-detail-card is-display"
        style={cardStyle}
        aria-label="Selected flight comment"
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setIsDropActive(false)
        }}
        onDrop={uploadDropped}
      >
        <div className="moment-detail-header is-draggable" onPointerDown={beginMove} onPointerMove={moveCard} onPointerUp={endMove} onPointerCancel={endMove}>
          <strong>{title}</strong>
          <div className="moment-header-actions">
            <button type="button" onClick={() => {
              onBeginEdit()
              setIsEditing(true)
            }} aria-label="Edit comment">
              ✎
            </button>
            <button type="button" className="panel-close-button" onClick={onDismiss} aria-label="Close comment">
              ×
            </button>
          </div>
        </div>
        {(moment.commentText ?? '').trim() ? <p className="moment-display-comment">{moment.commentText}</p> : null}
        {momentPhotos.length > 0 && (
          <div className="moment-display-photos">
            {momentPhotos.slice(0, 3).map((photo) => (
              <CommentPhotoPreview key={photo.id} photo={photo} onOpen={setLightboxUrl} />
            ))}
          </div>
        )}
        {isDropActive && <div className="moment-drop-hint">Drop photos</div>}
        {lightbox}
      </section>
    )
  }

  return (
    <section
      className={`moment-detail-card is-editing ${isDropActive ? 'is-drop-active' : ''}`}
      style={cardStyle}
      aria-label="Selected flight comment"
      onDragEnter={onDrag}
      onDragOver={onDrag}
      onDragLeave={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setIsDropActive(false)
      }}
      onDrop={uploadDropped}
    >
      <div className="moment-detail-header is-draggable" onPointerDown={beginMove} onPointerMove={moveCard} onPointerUp={endMove} onPointerCancel={endMove}>
        <strong>{title}</strong>
        <button type="button" className="panel-close-button" onClick={onDismiss} aria-label="Close comment">
          ×
        </button>
      </div>
      <textarea
        value={comment}
        maxLength={2000}
        onChange={(event) => setComment(event.currentTarget.value)}
        placeholder="Add a comment"
        aria-label="Comment text"
      />
      <div className="moment-detail-actions">
        <button type="button" onClick={() => {
          onSaveComment(comment)
          setIsEditing(false)
        }}>
          Save
        </button>
        <button type="button" onClick={onMoveToCurrentTime}>
          Move to current time
        </button>
        <button type="button" onClick={onDelete}>
          Delete comment
        </button>
      </div>

      <div className="moment-photo-tools">
        <label>
          Photo time offset
          <input
            type="number"
            value={offsetSeconds}
            onChange={(event) => onOffsetChange(Number(event.currentTarget.value) || 0)}
            step={60}
          />
        </label>
        <button type="button" onClick={() => inputRef.current?.click()}>
          Upload photos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={PHOTO_ACCEPT}
          multiple
          className="visually-hidden"
          aria-label="Upload photos"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            if (files.length > 0) onUploadPhotos(files, offsetSeconds)
            event.target.value = ''
          }}
        />
      </div>

      {momentPhotos.length > 0 ? (
        <div className="moment-photo-list">
          {momentPhotos.map((photo) => (
            <PhotoRow
              key={photo.id}
              photo={photo}
              onDelete={() => onDeletePhoto(photo.id)}
              onMovePhotoTime={(timeMs) => onMovePhotoTime(photo.id, timeMs)}
              onOpen={setLightboxUrl}
              timeZone={momentTimeZone}
            />
          ))}
        </div>
      ) : (
        <div className="moment-drop-hint-inline">Drop JPEG, PNG, WebP or HEIC photos here.</div>
      )}
      {lightbox}
    </section>
  )
}
