from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class FlightInput(ApiModel):
    hash: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=255)
    original_filename: str = Field(min_length=1, max_length=255)
    pilot_name: str = Field(max_length=255)
    start_time_ms: int
    end_time_ms: int
    duration_seconds: int = Field(ge=0)
    min_altitude: float
    max_altitude: float
    total_distance_meters: float = Field(ge=0)
    optimized_distance_meters: float = Field(ge=0)
    start_lat: float = Field(ge=-90, le=90)
    start_lng: float = Field(ge=-180, le=180)
    start_location_label: str = Field(min_length=1, max_length=255)
    start_place_id: str | None = Field(default=None, max_length=255)
    igc_text: str


class FlightSummary(ApiModel):
    id: str
    hash: str
    title: str
    original_filename: str
    pilot_name: str
    start_time_ms: int
    end_time_ms: int
    duration_seconds: int
    min_altitude: float
    max_altitude: float
    total_distance_meters: float
    optimized_distance_meters: float
    start_lat: float
    start_lng: float
    start_location_label: str
    start_place_id: str | None = None
    created_at: datetime
    updated_at: datetime


class StoredFlight(FlightSummary):
    igc_text: str


class RenameFlight(ApiModel):
    title: str = Field(min_length=1, max_length=255)


class MomentInput(ApiModel):
    flight_id: str
    fix_index: int = Field(ge=0)
    elapsed_seconds: float = Field(ge=0)
    time_ms: int
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    altitude: float
    comment_text: str | None = None


class MomentPatch(ApiModel):
    comment_text: str | None = None
    fix_index: int | None = Field(default=None, ge=0)
    elapsed_seconds: float | None = Field(default=None, ge=0)
    time_ms: int | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    altitude: float | None = None


class MomentOut(ApiModel):
    id: str
    flight_id: str
    fix_index: int
    elapsed_seconds: float
    time_ms: int
    lat: float
    lng: float
    altitude: float
    comment_text: str | None = None
    photo_ids: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


PlacementSource = Literal["exif-time-gps", "exif-time", "exif-gps", "current-playback", "manual"]


class PhotoMetadata(ApiModel):
    flight_id: str
    moment_id: str
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=100)
    size_bytes: int = Field(ge=0)
    exif_time_ms: int | None = None
    resolved_time_ms: int
    exif_lat: float | None = Field(default=None, ge=-90, le=90)
    exif_lng: float | None = Field(default=None, ge=-180, le=180)
    placement_source: PlacementSource

    @field_validator("mime_type")
    @classmethod
    def image_mime_type(cls, value: str) -> str:
        normalized = value.lower().strip()
        if normalized not in {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}:
            raise ValueError("Unsupported image MIME type")
        return normalized


class PhotoPatch(ApiModel):
    resolved_time_ms: int | None = None
    placement_source: PlacementSource | None = None


class PhotoOut(ApiModel):
    id: str
    flight_id: str
    moment_id: str
    filename: str
    mime_type: str
    size_bytes: int
    original_url: str
    thumbnail_url: str | None = None
    exif_time_ms: int | None = None
    resolved_time_ms: int
    exif_lat: float | None = None
    exif_lng: float | None = None
    placement_source: PlacementSource
    created_at: datetime
    updated_at: datetime
