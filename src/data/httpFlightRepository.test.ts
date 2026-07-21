import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpFlightRepository } from './httpFlightRepository'

describe('HttpFlightRepository production photos', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('resolves relative server photo URLs against the API origin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: 'photo_1',
      flightId: 'flight_1',
      momentId: 'comment_1',
      filename: 'launch.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 100,
      originalUrl: '/photos/photo_1/original',
      thumbnailUrl: '/photos/photo_1/thumbnail',
      resolvedTimeMs: 1,
      placementSource: 'manual',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const repository = new HttpFlightRepository('https://flight-viewer-api.example.test')
    const photos = await repository.listPhotos('flight_1')

    expect(photos[0]?.originalUrl).toBe('https://flight-viewer-api.example.test/photos/photo_1/original')
    expect(photos[0]?.thumbnailUrl).toBe('https://flight-viewer-api.example.test/photos/photo_1/thumbnail')
  })
})
