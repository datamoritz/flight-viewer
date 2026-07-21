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
import { parseIgc } from '../igc/parser'
import { cumulativeTrackDistanceMeters, roughOptimizedFreeDistanceMeters } from '../utils/geo'

const DB_NAME = 'paragliding-viewer'
const DB_VERSION = 1

interface DbStores {
  flights: StoredFlight
  moments: FlightMoment
  photos: FlightPhoto
}

type StoreName = keyof DbStores

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'))
  })
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function hasDistanceMetadata(flight: StoredFlight): boolean {
  return Number.isFinite(flight.totalDistanceMeters) && Number.isFinite(flight.optimizedDistanceMeters)
}

function toFlightSummary(flight: StoredFlight): FlightSummary {
  const { igcText: _igcText, ...summary } = flight
  return summary
}

export class IndexedDbFlightRepository implements FlightRepository {
  readonly mode = 'indexeddb' as const
  private dbPromise: Promise<IDBDatabase> | null = null

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('flights')) {
          const store = db.createObjectStore('flights', { keyPath: 'id' })
          store.createIndex('hash', 'hash', { unique: true })
          store.createIndex('createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains('moments')) {
          const store = db.createObjectStore('moments', { keyPath: 'id' })
          store.createIndex('flightId', 'flightId')
          store.createIndex('flightId_timeMs', ['flightId', 'timeMs'])
        }
        if (!db.objectStoreNames.contains('photos')) {
          const store = db.createObjectStore('photos', { keyPath: 'id' })
          store.createIndex('flightId', 'flightId')
          store.createIndex('momentId', 'momentId')
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'))
    })
    return this.dbPromise
  }

  private async store<K extends StoreName>(name: K, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.db()
    return db.transaction(name, mode).objectStore(name)
  }

  private async ensureDistanceMetadata(flight: StoredFlight): Promise<StoredFlight> {
    if (hasDistanceMetadata(flight)) return flight

    try {
      const parsed = parseIgc(flight.igcText)
      const next: StoredFlight = {
        ...flight,
        totalDistanceMeters: cumulativeTrackDistanceMeters(parsed.fixes),
        optimizedDistanceMeters: roughOptimizedFreeDistanceMeters(parsed.fixes),
        updatedAt: nowIso(),
      }
      const store = await this.store('flights', 'readwrite')
      await requestToPromise(store.put(next))
      return next
    } catch (error) {
      console.warn('Could not backfill flight distance metadata.', error)
      return flight
    }
  }

  async listFlights(): Promise<FlightSummary[]> {
    const store = await this.store('flights', 'readonly')
    const flights = await requestToPromise<StoredFlight[]>(store.getAll())
    const activeFlights = flights.filter((flight) => !flight.deletedAt)
    const normalizedFlights = await Promise.all(activeFlights.map((flight) => this.ensureDistanceMetadata(flight)))
    return normalizedFlights
      .filter((flight) => !flight.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toFlightSummary)
  }

  async getFlight(id: string): Promise<StoredFlight | null> {
    const store = await this.store('flights', 'readonly')
    const flight = await requestToPromise<StoredFlight | undefined>(store.get(id))
    return flight && !flight.deletedAt ? this.ensureDistanceMetadata(flight) : null
  }

  async findFlightByHash(hash: string): Promise<FlightSummary | null> {
    const store = await this.store('flights', 'readonly')
    const index = store.index('hash')
    const flight = await requestToPromise<StoredFlight | undefined>(index.get(hash))
    if (!flight || flight.deletedAt) return null
    return toFlightSummary(await this.ensureDistanceMetadata(flight))
  }

  async createFlight(input: NewFlightInput): Promise<StoredFlight> {
    const timestamp = nowIso()
    const flight: StoredFlight = {
      id: makeId('flight'),
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const store = await this.store('flights', 'readwrite')
    await requestToPromise(store.add(flight))
    return flight
  }

  async renameFlight(id: string, title: string): Promise<FlightSummary> {
    const store = await this.store('flights', 'readwrite')
    const flight = await requestToPromise<StoredFlight | undefined>(store.get(id))
    if (!flight || flight.deletedAt) throw new Error('Flight not found.')
    const next = { ...flight, title, updatedAt: nowIso() }
    await requestToPromise(store.put(next))
    return toFlightSummary(next)
  }

  async deleteFlight(id: string): Promise<void> {
    const db = await this.db()
    const tx = db.transaction(['flights', 'moments', 'photos'], 'readwrite')
    tx.objectStore('flights').delete(id)

    const momentIndex = tx.objectStore('moments').index('flightId')
    const photoIndex = tx.objectStore('photos').index('flightId')
    await Promise.all([
      this.deleteByIndex(momentIndex, id),
      this.deleteByIndex(photoIndex, id),
      txDone(tx),
    ])
  }

  private deleteByIndex(index: IDBIndex, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.only(value))
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve()
          return
        }
        cursor.delete()
        cursor.continue()
      }
      request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed.'))
    })
  }

  async listMoments(flightId: string): Promise<FlightMoment[]> {
    const store = await this.store('moments', 'readonly')
    const moments = await requestToPromise<FlightMoment[]>(store.index('flightId').getAll(flightId))
    return moments.filter((moment) => !moment.deletedAt).sort((a, b) => a.timeMs - b.timeMs)
  }

  async createMoment(input: NewMomentInput): Promise<FlightMoment> {
    const timestamp = nowIso()
    const moment: FlightMoment = {
      id: makeId('moment'),
      photoIds: [],
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const store = await this.store('moments', 'readwrite')
    await requestToPromise(store.add(moment))
    return moment
  }

  async updateMoment(id: string, patch: Partial<NewMomentInput>): Promise<FlightMoment> {
    const store = await this.store('moments', 'readwrite')
    const moment = await requestToPromise<FlightMoment | undefined>(store.get(id))
    if (!moment || moment.deletedAt) throw new Error('Moment not found.')
    const next = { ...moment, ...patch, updatedAt: nowIso() }
    await requestToPromise(store.put(next))
    return next
  }

  async deleteMoment(id: string): Promise<void> {
    const db = await this.db()
    const tx = db.transaction(['moments', 'photos'], 'readwrite')
    tx.objectStore('moments').delete(id)
    await Promise.all([this.deleteByIndex(tx.objectStore('photos').index('momentId'), id), txDone(tx)])
  }

  async listPhotos(flightId: string): Promise<FlightPhoto[]> {
    const store = await this.store('photos', 'readonly')
    const photos = await requestToPromise<FlightPhoto[]>(store.index('flightId').getAll(flightId))
    return photos.filter((photo) => !photo.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async createPhoto(input: NewPhotoInput): Promise<FlightPhoto> {
    const db = await this.db()
    const tx = db.transaction(['moments', 'photos'], 'readwrite')
    const timestamp = nowIso()
    const photo: FlightPhoto = {
      id: makeId('photo'),
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const moments = tx.objectStore('moments')
    const moment = await requestToPromise<FlightMoment | undefined>(moments.get(input.momentId))
    if (!moment) throw new Error('Moment not found.')
    await requestToPromise(tx.objectStore('photos').add(photo))
    await requestToPromise(moments.put({ ...moment, photoIds: [...moment.photoIds, photo.id], updatedAt: timestamp }))
    await txDone(tx)
    return photo
  }

  async updatePhoto(id: string, patch: { resolvedTimeMs?: number; placementSource?: FlightPhoto['placementSource'] }): Promise<FlightPhoto> {
    const store = await this.store('photos', 'readwrite')
    const photo = await requestToPromise<FlightPhoto | undefined>(store.get(id))
    if (!photo || photo.deletedAt) throw new Error('Photo not found.')
    const next = { ...photo, ...patch, updatedAt: nowIso() }
    await requestToPromise(store.put(next))
    return next
  }

  async deletePhoto(id: string): Promise<void> {
    const db = await this.db()
    const tx = db.transaction(['moments', 'photos'], 'readwrite')
    const photos = tx.objectStore('photos')
    const photo = await requestToPromise<FlightPhoto | undefined>(photos.get(id))
    if (!photo) return
    const moments = tx.objectStore('moments')
    const moment = await requestToPromise<FlightMoment | undefined>(moments.get(photo.momentId))
    await requestToPromise(photos.delete(id))
    if (moment) {
      await requestToPromise(moments.put({ ...moment, photoIds: moment.photoIds.filter((photoId) => photoId !== id), updatedAt: nowIso() }))
    }
    await txDone(tx)
  }
}
