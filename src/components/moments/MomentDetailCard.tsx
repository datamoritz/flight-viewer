import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { FlightMoment, FlightPhoto } from '../../data/types'

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

function CommentPhotoPreview({ photo }: { photo: FlightPhoto }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const blob = photo.thumbnailBlob ?? photo.originalBlob
    if (!blob) {
      setUrl(photo.thumbnailUrl ?? photo.originalUrl ?? null)
      return
    }
    const nextUrl = URL.createObjectURL(blob)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [photo])

  return url ? <img src={url} alt={photo.filename} /> : null
}

function toDateTimeLocal(timeMs: number): string {
  const date = new Date(timeMs)
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(timeMs - offsetMs).toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string): number | null {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function formatTime(timeMs: number | undefined): string {
  if (timeMs === undefined) return 'No EXIF time'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timeMs)
}

function PhotoRow({
  photo,
  onDelete,
  onMovePhotoTime,
}: {
  photo: FlightPhoto
  onDelete: () => void
  onMovePhotoTime: (timeMs: number) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const blob = photo.thumbnailBlob ?? photo.originalBlob
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
      {url ? <img src={url} alt={photo.filename} /> : <div className="moment-photo-missing">No preview</div>}
      <div className="moment-photo-row-main">
        <strong>{photo.filename}</strong>
        <span>Detected: {formatTime(photo.exifTimeMs)}</span>
        <label>
          Placed time
          <input
            type="datetime-local"
            value={toDateTimeLocal(photo.resolvedTimeMs)}
            onChange={(event) => {
              const next = fromDateTimeLocal(event.currentTarget.value)
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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const isEmptyMoment = !(moment.commentText ?? '').trim() && momentPhotos.length === 0
    setComment(moment.commentText ?? '')
    setIsEditing(isEmptyMoment)
  }, [moment, momentPhotos.length])

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

  const title = new Date(moment.timeMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  if (!isEditing) {
    return (
      <section
        className="moment-detail-card is-display"
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
        <div className="moment-detail-header">
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
              <CommentPhotoPreview key={photo.id} photo={photo} />
            ))}
          </div>
        )}
        {isDropActive && <div className="moment-drop-hint">Drop photos</div>}
      </section>
    )
  }

  return (
    <section
      className={`moment-detail-card is-editing ${isDropActive ? 'is-drop-active' : ''}`}
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
      <div className="moment-detail-header">
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
            />
          ))}
        </div>
      ) : (
        <div className="moment-drop-hint-inline">Drop JPEG, PNG, WebP or HEIC photos here.</div>
      )}
    </section>
  )
}
