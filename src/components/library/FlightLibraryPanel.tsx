import { useRef, useState } from 'react'
import type { FlightSummary } from '../../data/types'
import { countryFlagForCoordinates } from '../../utils/locationMetadata'

export interface FlightLibraryPanelProps {
  flights: FlightSummary[]
  activeFlightId: string | null
  repositoryMode: string
  isBusy: boolean
  onUpload: (file: File) => void
  onSelect: (flightId: string) => void
  onRename: (flight: FlightSummary, title: string) => void
  onDelete: (flight: FlightSummary) => void
  onClose: () => void
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function formatDate(timeMs: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(timeMs)
}

function formatDistance(meters: number | undefined): string {
  if (!Number.isFinite(meters)) return 'Distance pending'
  const km = (meters ?? 0) / 1000
  return `${km.toFixed(km >= 100 ? 0 : 1)} km`
}

export function FlightLibraryPanel({
  flights,
  activeFlightId,
  isBusy,
  onUpload,
  onSelect,
  onRename,
  onDelete,
  onClose,
}: FlightLibraryPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  return (
    <section className="flight-library-panel" aria-label="Flight library">
      <div className="flight-library-header">
        <div>
          <h2>Flights <span className="flight-count">{flights.length}</span></h2>
          <p>Drag and drop an IGC file or click the add button.</p>
        </div>
        <div className="flight-library-header-actions">
          <button type="button" className="flight-library-add" onClick={() => inputRef.current?.click()} disabled={isBusy} aria-label="Add IGC flight" title="Add IGC flight">
            +
          </button>
          <button type="button" className="panel-close-button" onClick={onClose} aria-label="Close flights panel">
            ×
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".igc,.IGC,application/octet-stream,text/plain"
        className="visually-hidden"
        aria-label="Upload IGC file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onUpload(file)
          event.target.value = ''
        }}
      />

      <div className="flight-library-list">
        {flights.length === 0 ? (
          <p className="flight-library-empty">No flights uploaded yet.</p>
        ) : (
          flights.map((flight) => (
            <article
              key={flight.id}
              className={`flight-library-row ${flight.id === activeFlightId ? 'is-active' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Open ${flight.title}`}
              onClick={() => editingFlightId !== flight.id && onSelect(flight.id)}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && editingFlightId !== flight.id) onSelect(flight.id)
              }}
            >
              <div className="flight-library-main">
                {editingFlightId === flight.id ? (
                  <input
                    className="flight-title-input"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && draftTitle.trim()) {
                        onRename(flight, draftTitle.trim())
                        setEditingFlightId(null)
                      }
                      if (event.key === 'Escape') setEditingFlightId(null)
                    }}
                    aria-label="Flight title"
                    autoFocus
                  />
                ) : (
                  <div className="flight-library-select">
                    <strong><span className="flight-country-flag" aria-hidden="true">{countryFlagForCoordinates(flight.startLat, flight.startLng)}</span>{flight.title}</strong>
                  </div>
                )}
                <div className="flight-library-meta">
                  <span>{flight.pilotName}</span>
                  <span>{formatDate(flight.startTimeMs)}</span>
                  <span>{formatDuration(flight.durationSeconds)}</span>
                </div>
                <div className="flight-library-distances">
                  <span title="Total distance flown along the recorded track">Σ {formatDistance(flight.totalDistanceMeters)}</span>
                  <span title="Rough optimized free distance between the furthest sampled track points">↔ {formatDistance(flight.optimizedDistanceMeters)}</span>
                </div>
              </div>
              <div className="flight-library-actions" onClick={(event) => event.stopPropagation()}>
                {editingFlightId === flight.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (draftTitle.trim()) onRename(flight, draftTitle.trim())
                        setEditingFlightId(null)
                      }}
                      aria-label={`Save ${flight.title}`}
                      title="Save title"
                    >
                      ✓
                    </button>
                    <button type="button" onClick={() => onDelete(flight)} aria-label={`Delete ${flight.title}`} title="Delete flight">
                      🗑
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFlightId(flight.id)
                      setDraftTitle(flight.title)
                    }}
                    aria-label={`Edit ${flight.title}`}
                    title="Edit flight"
                  >
                    ✎
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
