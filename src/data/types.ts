export type RepositoryMode = 'indexeddb' | 'http'

export interface FlightSummary {
  id: string
  hash: string
  title: string
  originalFilename: string
  pilotName: string
  startTimeMs: number
  endTimeMs: number
  durationSeconds: number
  minAltitude: number
  maxAltitude: number
  totalDistanceMeters: number
  optimizedDistanceMeters: number
  startLat: number
  startLng: number
  startLocationLabel: string
  startPlaceId?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface StoredFlight extends FlightSummary {
  igcText: string
}

export interface NewFlightInput {
  hash: string
  title: string
  originalFilename: string
  pilotName: string
  startTimeMs: number
  endTimeMs: number
  durationSeconds: number
  minAltitude: number
  maxAltitude: number
  totalDistanceMeters: number
  optimizedDistanceMeters: number
  startLat: number
  startLng: number
  startLocationLabel: string
  startPlaceId?: string
  igcText: string
}

export interface FlightMoment {
  id: string
  flightId: string
  fixIndex: number
  elapsedSeconds: number
  timeMs: number
  lat: number
  lng: number
  altitude: number
  commentText?: string
  photoIds: string[]
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface NewMomentInput {
  flightId: string
  fixIndex: number
  elapsedSeconds: number
  timeMs: number
  lat: number
  lng: number
  altitude: number
  commentText?: string
}

export type PhotoPlacementSource = 'exif-time-gps' | 'exif-time' | 'exif-gps' | 'current-playback' | 'manual'

export interface FlightPhoto {
  id: string
  flightId: string
  momentId: string
  filename: string
  mimeType: string
  sizeBytes: number
  originalBlob?: Blob
  thumbnailBlob?: Blob
  originalUrl?: string
  thumbnailUrl?: string
  exifTimeMs?: number
  resolvedTimeMs: number
  exifLat?: number
  exifLng?: number
  placementSource: PhotoPlacementSource
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface NewPhotoInput {
  flightId: string
  momentId: string
  filename: string
  mimeType: string
  sizeBytes: number
  originalBlob: Blob
  thumbnailBlob?: Blob
  exifTimeMs?: number
  resolvedTimeMs: number
  exifLat?: number
  exifLng?: number
  placementSource: PhotoPlacementSource
}

export interface FlightRepository {
  mode: RepositoryMode
  listFlights(): Promise<FlightSummary[]>
  getFlight(id: string): Promise<StoredFlight | null>
  findFlightByHash(hash: string): Promise<FlightSummary | null>
  createFlight(input: NewFlightInput): Promise<StoredFlight>
  renameFlight(id: string, title: string): Promise<FlightSummary>
  deleteFlight(id: string): Promise<void>
  listMoments(flightId: string): Promise<FlightMoment[]>
  createMoment(input: NewMomentInput): Promise<FlightMoment>
  updateMoment(id: string, patch: { commentText?: string; fixIndex?: number; elapsedSeconds?: number; timeMs?: number; lat?: number; lng?: number; altitude?: number }): Promise<FlightMoment>
  deleteMoment(id: string): Promise<void>
  listPhotos(flightId: string): Promise<FlightPhoto[]>
  createPhoto(input: NewPhotoInput): Promise<FlightPhoto>
  updatePhoto(id: string, patch: { resolvedTimeMs?: number; placementSource?: PhotoPlacementSource }): Promise<FlightPhoto>
  deletePhoto(id: string): Promise<void>
}
