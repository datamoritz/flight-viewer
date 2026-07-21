# Flight Viewer deployment

## Production endpoints

- Frontend: `https://flight-viewer.moritzknodler.com`
- API: `https://flight-viewer-api.moritzknodler.com`
- Backend host port: `127.0.0.1:8003`

## Vercel

Import the GitHub repository as a Vite project. `vercel.json` pins the build
command and output directory. Configure these Production and Preview variables:

```text
VITE_GOOGLE_MAPS_API_KEY=<browser-restricted Google Maps key>
VITE_DATA_API_URL=https://flight-viewer-api.moritzknodler.com
```

Add `flight-viewer.moritzknodler.com` to the Vercel project. In Google Cloud,
allow that origin and the required Vercel preview origins on the browser key.

## Backend

The server installation lives at `/opt/flight-viewer` and uses Docker Compose.
PostgreSQL and photos are stored in the named volumes
`flight-viewer-postgres` and `flight-viewer-photos`. The backend is reachable
only on localhost; Cloudflare Tunnel publishes the API hostname.

Useful checks:

```sh
cd /opt/flight-viewer
docker compose ps
docker compose logs --tail=100 backend
curl -fsS http://127.0.0.1:8003/health
```

Back up both named volumes. Database and photo backups must be captured as one
logical backup set so their references remain consistent.
