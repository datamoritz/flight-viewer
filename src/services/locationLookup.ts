export interface LocationLookupResult {
  label: string
  placeId?: string
}

export interface LocationLookupService {
  lookupStartLocation(point: { lat: number; lng: number }): Promise<LocationLookupResult>
}

function roundedCoordinates(point: { lat: number; lng: number }): string {
  return `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`
}

type GeocodeComponent = {
  long_name: string
  short_name: string
  types: string[]
}

type GeocodeResult = {
  place_id?: string
  address_components?: GeocodeComponent[]
}

function component(result: GeocodeResult, type: string): GeocodeComponent | undefined {
  return result.address_components?.find((entry) => entry.types.includes(type))
}

export function makeStartLocationLabel(result: GeocodeResult, fallbackPoint: { lat: number; lng: number }): LocationLookupResult {
  const locality = component(result, 'locality') ?? component(result, 'sublocality')
  const state = component(result, 'administrative_area_level_1')
  const county = component(result, 'administrative_area_level_2')

  if (locality && state) return { label: `${locality.long_name}, ${state.short_name}`, placeId: result.place_id }
  if (locality) return { label: locality.long_name, placeId: result.place_id }
  if (county && state) return { label: `${county.long_name}, ${state.short_name}`, placeId: result.place_id }
  if (county) return { label: county.long_name, placeId: result.place_id }
  return { label: roundedCoordinates(fallbackPoint), placeId: result.place_id }
}

export class GoogleLocationLookupService implements LocationLookupService {
  private readonly apiKey: string | undefined

  constructor(apiKey: string | undefined) {
    this.apiKey = apiKey
  }

  async lookupStartLocation(point: { lat: number; lng: number }): Promise<LocationLookupResult> {
    if (!this.apiKey) return { label: roundedCoordinates(point) }
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
      url.searchParams.set('latlng', `${point.lat},${point.lng}`)
      url.searchParams.set('key', this.apiKey)
      const response = await fetch(url)
      if (!response.ok) throw new Error('Geocoding request failed.')
      const payload = (await response.json()) as { results?: GeocodeResult[] }
      const first = payload.results?.[0]
      if (!first) return { label: roundedCoordinates(point) }
      return makeStartLocationLabel(first, point)
    } catch {
      return { label: roundedCoordinates(point) }
    }
  }
}
