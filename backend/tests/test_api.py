from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


PNG = b"\x89PNG\r\n\x1a\n" + b"flight-viewer-image"
JPEG = b"\xff\xd8\xff\xe0" + b"flight-viewer-thumbnail"


@pytest.fixture
def client(tmp_path: Path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        photo_root=tmp_path / "photos",
        public_base_url="https://flight-viewer-api.example.test",
        allowed_origins=("https://flight-viewer.example.test",),
        allowed_origin_regex=r"^https://flight-viewer-[a-z0-9-]+\.vercel\.app$",
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client, settings


def flight_payload(hash_value: str = "abc123") -> dict:
    return {
        "hash": hash_value,
        "title": "Morning flight",
        "originalFilename": "morning.igc",
        "pilotName": "Test Pilot",
        "startTimeMs": 1_700_000_000_000,
        "endTimeMs": 1_700_000_060_000,
        "durationSeconds": 60,
        "minAltitude": 1200,
        "maxAltitude": 1600,
        "totalDistanceMeters": 5500,
        "optimizedDistanceMeters": 5100,
        "startLat": 46.8,
        "startLng": 8.2,
        "startLocationLabel": "Test Valley",
        "igcText": "AXXX\nB1200004680000N00812000EA0120001200",
    }


def create_flight(client: TestClient) -> dict:
    response = client.post("/flights", json=flight_payload())
    assert response.status_code == 201, response.text
    return response.json()


def create_comment(client: TestClient, flight_id: str) -> dict:
    response = client.post(
        f"/flights/{flight_id}/moments",
        json={
            "flightId": flight_id,
            "fixIndex": 2,
            "elapsedSeconds": 10,
            "timeMs": 1_700_000_010_000,
            "lat": 46.81,
            "lng": 8.21,
            "altitude": 1300,
            "commentText": "Found lift",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def upload_photo(client: TestClient, flight_id: str, comment_id: str) -> dict:
    metadata = {
        "flightId": flight_id,
        "momentId": comment_id,
        "filename": "launch.png",
        "mimeType": "image/png",
        "sizeBytes": len(PNG),
        "resolvedTimeMs": 1_700_000_010_000,
        "placementSource": "current-playback",
    }
    response = client.post(
        f"/flights/{flight_id}/photos",
        data={"metadata": json.dumps(metadata)},
        files={
            "original": ("launch.png", PNG, "image/png"),
            "thumbnail": ("launch.thumb.jpg", JPEG, "image/jpeg"),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_complete_flight_comment_and_photo_lifecycle(client):
    test_client, settings = client
    assert test_client.get("/health").json() == {"status": "ok", "service": "flight-viewer"}

    flight = create_flight(test_client)
    flight_id = flight["id"]
    assert test_client.get(f"/flights/by-hash/{flight['hash']}").json()["id"] == flight_id
    assert test_client.get(f"/flights/{flight_id}").json()["igcText"].startswith("AXXX")

    renamed = test_client.patch(f"/flights/{flight_id}", json={"title": "Renamed flight"})
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Renamed flight"

    comment = create_comment(test_client, flight_id)
    comment_id = comment["id"]
    updated_comment = test_client.patch(
        f"/moments/{comment_id}", json={"commentText": "Strong lift"}
    )
    assert updated_comment.status_code == 200
    assert updated_comment.json()["commentText"] == "Strong lift"

    photo = upload_photo(test_client, flight_id, comment_id)
    photo_id = photo["id"]
    assert photo["originalUrl"] == f"https://flight-viewer-api.example.test/photos/{photo_id}/original"
    assert photo["thumbnailUrl"] == f"https://flight-viewer-api.example.test/photos/{photo_id}/thumbnail"
    assert test_client.get(f"/photos/{photo_id}/original").content == PNG
    assert test_client.get(f"/photos/{photo_id}/thumbnail").content == JPEG

    listed_photos = test_client.get(f"/flights/{flight_id}/photos").json()
    assert [item["id"] for item in listed_photos] == [photo_id]
    listed_comments = test_client.get(f"/flights/{flight_id}/moments").json()
    assert listed_comments[0]["photoIds"] == [photo_id]

    moved = test_client.patch(
        f"/photos/{photo_id}",
        json={"resolvedTimeMs": 1_700_000_020_000, "placementSource": "manual"},
    )
    assert moved.status_code == 200
    assert moved.json()["placementSource"] == "manual"

    assert test_client.delete(f"/flights/{flight_id}").status_code == 204
    assert test_client.get(f"/flights/{flight_id}").status_code == 404
    assert not list(settings.photo_root.rglob("*.png"))
    assert not list(settings.photo_root.rglob("*.jpg"))


def test_duplicate_hash_and_invalid_image_are_rejected(client):
    test_client, _ = client
    flight = create_flight(test_client)
    assert test_client.post("/flights", json=flight_payload()).status_code == 409
    comment = create_comment(test_client, flight["id"])

    metadata = {
        "flightId": flight["id"],
        "momentId": comment["id"],
        "filename": "fake.png",
        "mimeType": "image/png",
        "sizeBytes": 12,
        "resolvedTimeMs": 1_700_000_010_000,
        "placementSource": "manual",
    }
    response = test_client.post(
        f"/flights/{flight['id']}/photos",
        data={"metadata": json.dumps(metadata)},
        files={"original": ("fake.png", b"not an image", "image/png")},
    )
    assert response.status_code == 415


def test_cors_is_limited_to_configured_frontend(client):
    test_client, _ = client
    allowed = test_client.options(
        "/flights",
        headers={
            "Origin": "https://flight-viewer.example.test",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert allowed.headers["access-control-allow-origin"] == "https://flight-viewer.example.test"

    denied = test_client.options(
        "/flights",
        headers={"Origin": "https://other.example.test", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in denied.headers

    preview = test_client.options(
        "/flights",
        headers={
            "Origin": "https://flight-viewer-feature-123.vercel.app",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert preview.headers["access-control-allow-origin"] == "https://flight-viewer-feature-123.vercel.app"
