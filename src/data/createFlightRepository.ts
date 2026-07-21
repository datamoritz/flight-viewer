import { HttpFlightRepository } from './httpFlightRepository'
import { IndexedDbFlightRepository } from './indexedDbFlightRepository'
import type { FlightRepository } from './types'

export function createFlightRepository(dataApiUrl: string | undefined): FlightRepository {
  const normalized = dataApiUrl?.trim().replace(/\/+$/, '')
  if (normalized) return new HttpFlightRepository(normalized)
  return new IndexedDbFlightRepository()
}
