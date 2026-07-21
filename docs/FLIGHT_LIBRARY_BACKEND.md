# flight-viewer Persistence

The frontend uses a typed `FlightRepository` interface. When `VITE_DATA_API_URL`
is unset, the app uses IndexedDB as a local development/demo adapter. IndexedDB
persists only in the current browser profile and is not shared across users,
devices, or browsers.

When `VITE_DATA_API_URL` is set, the app uses the HTTP API in `backend/`. A
Vercel deployment calls the persistent server through that URL.
Do not rely on Vercel's filesystem for IGC files, original photos, thumbnails,
or comments.

## Google Start Location Lookup

Uploaded flights reverse-geocode the first valid IGC fix through
`LocationLookupService`. The current adapter uses the Google Geocoding API and
stores `startLocationLabel` plus optional `startPlaceId` on the flight record so
the lookup runs once per upload.

Required Google Cloud setup:

- Maps JavaScript API for the 3D map.
- Geocoding API for start-location labels.
- HTTP referrer restrictions for localhost and deployed origins.

Reverse-geocoding failure must not block upload. The fallback label is rounded
coordinates.

## Limits

- IGC files: 10 MB.
- Original photos: 25 MB each.
- IndexedDB photo storage: 100 MB total per flight.
- Comment text: 2000 characters.

These limits live in `src/data/config.ts` and should be mirrored by the backend.
The backend should also enforce request-size limits, MIME/content validation,
rate limiting, and admin protection. Without authentication, it cannot enforce
ownership; all flights, comments, and photos are public/shared.

## REST Contract

All JSON timestamps are ISO 8601 strings except flight/fix timestamps, which are
Unix milliseconds UTC to match the existing IGC parser.

### Flights

`GET /flights`

Returns `FlightSummary[]`, excluding `igcText`.

`GET /flights/:flightId`

Returns `StoredFlight`, including the original `igcText` so the frontend can
reparse and load playback.

`GET /flights/by-hash/:hash`

Returns a `FlightSummary` or `null`. Used for duplicate upload prevention.

`POST /flights`

Body: `NewFlightInput`. Creates a flight atomically. The backend should reject
duplicate `hash` values. Flight metadata includes `totalDistanceMeters` and a
rough `optimizedDistanceMeters` summary computed by the frontend for now; the
backend may recompute these later if it becomes authoritative for parsing.

`PATCH /flights/:flightId`

Body: `{ "title": "New title" }`. Returns updated `FlightSummary`.

`DELETE /flights/:flightId`

Atomic cascade delete. Removes the flight, moments, comments, original photos,
and thumbnails/previews. The frontend should not issue many individual delete
requests for this cascade.

### Moments

`GET /flights/:flightId/moments`

Returns `FlightMoment[]`, sorted by `timeMs`.

`POST /flights/:flightId/moments`

Body: `NewMomentInput`. Moment coordinates are derived from the associated IGC
fix on the frontend before submission.

`PATCH /moments/:momentId`

Body may include `commentText` or a full replacement anchor:
`fixIndex`, `elapsedSeconds`, `timeMs`, `lat`, `lng`, `altitude`.

`DELETE /moments/:momentId`

Deletes the moment and any attached photos.

### Photos

`GET /flights/:flightId/photos`

Returns photo metadata with `originalUrl` and optional `thumbnailUrl`. The
local IndexedDB adapter returns browser blobs instead.

`POST /flights/:flightId/photos`

Multipart form data:

- `metadata`: JSON containing `flightId`, `momentId`, `filename`, `mimeType`,
  `sizeBytes`, EXIF fields when present, and `placementSource`.
- `resolvedTimeMs` stores the final user-reviewed placement time.
- `original`: original image file.
- `thumbnail`: optional generated preview.

The backend should store originals separately from thumbnails/previews.

`DELETE /photos/:photoId`

Deletes one photo and removes it from its moment.

`PATCH /photos/:photoId`

Body may include `resolvedTimeMs` and `placementSource: "manual"` when the user
overwrites the detected/placed photo time. If the backend stores canonical
photo anchors, it should also update the associated moment anchor consistently.
