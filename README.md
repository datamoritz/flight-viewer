# Flight Viewer

A browser-based 3D viewer for paragliding flights recorded as IGC files. Upload
a flight, watch it fly back over real 3D satellite terrain, scrub through its
altitude profile, and follow the pilot with a camera that respects however you
choose to look at it.

IGC parsing and playback run in the browser. By default, the flight library is
stored in IndexedDB. A production deployment can use the included
`flight-viewer` API for PostgreSQL-backed flight data and server-hosted photos.

## Stack

- React + TypeScript + Vite
- [Google Maps Platform 3D Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/3d-maps-overview) (`google.maps.maps3d`, currently an alpha/preview library)
- Vitest for unit tests
- oxlint for linting
- FastAPI + PostgreSQL persistence API

## Setup

1. `npm install`
2. Get a Google Maps Platform API key:
   - Enable **Maps JavaScript API** on it in the [Cloud Console](https://console.cloud.google.com/google/maps-apis/api-list).
   - Confirm the project has access to the 3D Maps preview (`maps3d` library, alpha channel).
   - Restrict the key to your local/deployed origins before using it anywhere but `localhost`.
3. Copy `.env.example` to `.env.local` and put your key in `VITE_GOOGLE_MAPS_API_KEY`. This file is gitignored and never committed.
4. `npm run dev`, then open the printed local URL.

## Persistence API

The `backend/` directory contains the production persistence API. It stores
flight metadata, IGC text, comments, and photo metadata in PostgreSQL. Original
photos and thumbnails live in a dedicated Docker volume on the server.

For a local container smoke test:

1. Copy `.env.docker.example` to `.env` and replace the database password.
2. Run `docker compose up --build`.
3. Set `VITE_DATA_API_URL=http://127.0.0.1:8003` in `.env.local`.

The API is intentionally unauthenticated for now. Configure `ALLOWED_ORIGINS`
to the exact deployed frontend origin and do not expose PostgreSQL publicly.
Backend tests use `backend/requirements-dev.txt` and run with `pytest` from the
`backend/` directory.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and build for production
- `npm run lint` — oxlint
- `npm run typecheck` — `tsc -b` with no emit
- `npm run test` — run the unit test suite once
- `npm run test:watch` — run tests in watch mode
- `npm run test:e2e` — Playwright end-to-end suite (mocked map boundary — no
  API key, network, or GPU needed; safe in CI)
- `npm run test:e2e:ui` — the same suite in Playwright's interactive UI

Real Google rendering can't be covered by the mocked e2e suite — after
changing map code, walk the checklist in
[docs/MANUAL_SMOKE_TEST.md](docs/MANUAL_SMOKE_TEST.md) against the live API.

## Using it

Drag an IGC file anywhere onto the window, or use the **Upload IGC** button.
The camera flies to fit the flight, then playback begins from the start with
only the altitude profile fully shown; the 3D track is **revealed
progressively** as the flight advances, colored by climb/sink rate (purple/blue
sink → yellow level → orange/red/pink climb). Scrubbing reveals the track up to
the chosen moment. A vertical pilot marker with the pilot's name and current
altitude tracks the current position.

Space bar toggles play/pause (when focus isn't in an input). Click or drag in
the translucent altitude panel to scrub; drag its top handle to resize it.

The camera **always follows** the pilot — the pilot stays fixed on screen while
the landscape moves around it. You can freely change the *viewpoint* at any
time and it sticks while following: orbit/tilt/zoom with the mouse or trackpad,
or use the on-screen camera controls (rotate, tilt, zoom, face-north — click or
hold to repeat) top-right, which work regardless of pointer-gesture support. A
pan chooses a new fixed screen position for the pilot, and playback keeps
following from there.

## Known limitations (alpha API)

- 3D Maps requires real GPU hardware acceleration in the browser; it will not
  render under software/headless rendering.
- Google's `maps3d` alpha channel injects a dev-only banner at the top of the
  page ("Using the alpha channel..."); this is expected during development
  and goes away once the API leaves preview.
- See [docs/MANUAL_SMOKE_TEST.md](docs/MANUAL_SMOKE_TEST.md) for the full
  list of observed alpha-API quirks and the manual verification checklist.
