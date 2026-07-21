"""Exercise a running flight-viewer API, including PostgreSQL and photo storage."""

from __future__ import annotations

import json
import sys
import time
from uuid import uuid4

import httpx


PNG = b"\x89PNG\r\n\x1a\n" + b"flight-viewer-live-smoke"
JPEG = b"\xff\xd8\xff\xe0" + b"flight-viewer-live-thumbnail"


def main() -> None:
    base_url = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8003").rstrip("/")
    with httpx.Client(base_url=base_url, timeout=15) as client:
        for _ in range(30):
            try:
                if client.get("/health").status_code == 200:
                    break
            except httpx.TransportError:
                pass
            time.sleep(0.5)
        else:
            raise RuntimeError("API did not become healthy")

        unique_hash = f"live-{uuid4().hex}"
        flight_response = client.post(
            "/flights",
            json={
                "hash": unique_hash,
                "title": "Live smoke flight",
                "originalFilename": "smoke.igc",
                "pilotName": "Smoke Pilot",
                "startTimeMs": 1_700_000_000_000,
                "endTimeMs": 1_700_000_060_000,
                "durationSeconds": 60,
                "minAltitude": 1200,
                "maxAltitude": 1600,
                "totalDistanceMeters": 5000,
                "optimizedDistanceMeters": 4800,
                "startLat": 46.8,
                "startLng": 8.2,
                "startLocationLabel": "Smoke Valley",
                "igcText": "AXXX\nB1200004680000N00812000EA0120001200",
            },
        )
        flight_response.raise_for_status()
        flight = flight_response.json()
        flight_id = flight["id"]

        try:
            comment_response = client.post(
                f"/flights/{flight_id}/moments",
                json={
                    "flightId": flight_id,
                    "fixIndex": 1,
                    "elapsedSeconds": 10,
                    "timeMs": 1_700_000_010_000,
                    "lat": 46.81,
                    "lng": 8.21,
                    "altitude": 1300,
                    "commentText": "Live smoke comment",
                },
            )
            comment_response.raise_for_status()
            comment = comment_response.json()

            metadata = {
                "flightId": flight_id,
                "momentId": comment["id"],
                "filename": "smoke.png",
                "mimeType": "image/png",
                "sizeBytes": len(PNG),
                "resolvedTimeMs": 1_700_000_010_000,
                "placementSource": "manual",
            }
            photo_response = client.post(
                f"/flights/{flight_id}/photos",
                data={"metadata": json.dumps(metadata)},
                files={
                    "original": ("smoke.png", PNG, "image/png"),
                    "thumbnail": ("smoke.thumb.jpg", JPEG, "image/jpeg"),
                },
            )
            photo_response.raise_for_status()
            photo = photo_response.json()
            assert client.get(photo["originalUrl"]).content == PNG
            assert client.get(photo["thumbnailUrl"]).content == JPEG
            assert client.get(f"/flights/{flight_id}/moments").json()[0]["photoIds"] == [photo["id"]]
        finally:
            delete_response = client.delete(f"/flights/{flight_id}")
            delete_response.raise_for_status()

    print("flight-viewer live API smoke passed")


if __name__ == "__main__":
    main()
