from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _csv(value: str) -> tuple[str, ...]:
    return tuple(item.strip().rstrip("/") for item in value.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    database_url: str
    photo_root: Path
    public_base_url: str | None
    allowed_origins: tuple[str, ...]
    allowed_origin_regex: str | None = None
    max_igc_bytes: int = 10 * 1024 * 1024
    max_photo_bytes: int = 25 * 1024 * 1024
    max_photo_bytes_per_flight: int = 100 * 1024 * 1024
    max_comment_length: int = 2_000


def load_settings() -> Settings:
    public_base_url = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/") or None
    return Settings(
        database_url=os.getenv(
            "DATABASE_URL",
            "sqlite:////tmp/flight-viewer.db",
        ),
        photo_root=Path(os.getenv("PHOTO_ROOT", "/data/photos")),
        public_base_url=public_base_url,
        allowed_origins=_csv(
            os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        ),
        allowed_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX", "").strip() or None,
    )
