import type {
  FlightMoment,
  FlightPhoto,
  FlightRepository,
  FlightSummary,
  NewFlightInput,
  NewMomentInput,
  NewPhotoInput,
  StoredFlight,
} from './types'

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  })
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export class HttpFlightRepository implements FlightRepository {
  readonly mode = 'http' as const
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private normalizePhoto(photo: FlightPhoto): FlightPhoto {
    const resolve = (value: string | undefined) => value ? new URL(value, `${this.baseUrl}/`).toString() : undefined
    return {
      ...photo,
      originalUrl: resolve(photo.originalUrl),
      thumbnailUrl: resolve(photo.thumbnailUrl),
    }
  }

  listFlights(): Promise<FlightSummary[]> {
    return jsonRequest(`${this.baseUrl}/flights`)
  }

  getFlight(id: string): Promise<StoredFlight | null> {
    return jsonRequest(`${this.baseUrl}/flights/${encodeURIComponent(id)}`)
  }

  findFlightByHash(hash: string): Promise<FlightSummary | null> {
    return jsonRequest(`${this.baseUrl}/flights/by-hash/${encodeURIComponent(hash)}`)
  }

  createFlight(input: NewFlightInput): Promise<StoredFlight> {
    return jsonRequest(`${this.baseUrl}/flights`, { method: 'POST', body: JSON.stringify(input) })
  }

  renameFlight(id: string, title: string): Promise<FlightSummary> {
    return jsonRequest(`${this.baseUrl}/flights/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    })
  }

  deleteFlight(id: string): Promise<void> {
    return jsonRequest(`${this.baseUrl}/flights/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  listMoments(flightId: string): Promise<FlightMoment[]> {
    return jsonRequest(`${this.baseUrl}/flights/${encodeURIComponent(flightId)}/moments`)
  }

  createMoment(input: NewMomentInput): Promise<FlightMoment> {
    return jsonRequest(`${this.baseUrl}/flights/${encodeURIComponent(input.flightId)}/moments`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  updateMoment(id: string, patch: Partial<NewMomentInput>): Promise<FlightMoment> {
    return jsonRequest(`${this.baseUrl}/moments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  }

  deleteMoment(id: string): Promise<void> {
    return jsonRequest(`${this.baseUrl}/moments/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async listPhotos(flightId: string): Promise<FlightPhoto[]> {
    const photos = await jsonRequest<FlightPhoto[]>(`${this.baseUrl}/flights/${encodeURIComponent(flightId)}/photos`)
    return photos.map((photo) => this.normalizePhoto(photo))
  }

  async createPhoto(input: NewPhotoInput): Promise<FlightPhoto> {
    const form = new FormData()
    form.set('metadata', JSON.stringify({
      flightId: input.flightId,
      momentId: input.momentId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      exifTimeMs: input.exifTimeMs,
      resolvedTimeMs: input.resolvedTimeMs,
      exifLat: input.exifLat,
      exifLng: input.exifLng,
      placementSource: input.placementSource,
    }))
    form.set('original', input.originalBlob, input.filename)
    if (input.thumbnailBlob) form.set('thumbnail', input.thumbnailBlob, `${input.filename}.thumb.jpg`)
    const photo = await jsonRequest<FlightPhoto>(`${this.baseUrl}/flights/${encodeURIComponent(input.flightId)}/photos`, {
      method: 'POST',
      body: form,
    })
    return this.normalizePhoto(photo)
  }

  async updatePhoto(id: string, patch: { resolvedTimeMs?: number; placementSource?: FlightPhoto['placementSource'] }): Promise<FlightPhoto> {
    const photo = await jsonRequest<FlightPhoto>(`${this.baseUrl}/photos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return this.normalizePhoto(photo)
  }

  deletePhoto(id: string): Promise<void> {
    return jsonRequest(`${this.baseUrl}/photos/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }
}
