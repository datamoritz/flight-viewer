from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status


EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}


def ensure_storage(root: Path) -> None:
    (root / "originals").mkdir(parents=True, exist_ok=True)
    (root / "thumbnails").mkdir(parents=True, exist_ok=True)


def image_signature_matches(data: bytes, mime_type: str) -> bool:
    if mime_type == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    if mime_type == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if mime_type == "image/webp":
        return data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    if mime_type in {"image/heic", "image/heif"}:
        return len(data) >= 12 and data[4:8] == b"ftyp"
    return False


async def save_upload(
    upload: UploadFile,
    root: Path,
    category: str,
    mime_type: str,
    max_bytes: int,
) -> tuple[str, int]:
    extension = EXTENSIONS[mime_type]
    relative = f"{category}/{uuid4().hex}{extension}"
    destination = root / relative
    temporary = destination.with_suffix(destination.suffix + ".part")
    total = 0
    first_chunk = True

    try:
        with temporary.open("wb") as output:
            while chunk := await upload.read(1024 * 1024):
                if first_chunk:
                    if not image_signature_matches(chunk, mime_type):
                        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "File content does not match its image type.")
                    first_chunk = False
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Image exceeds the upload size limit.")
                output.write(chunk)
        if total == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image is empty.")
        os.replace(temporary, destination)
        return relative, total
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()


def delete_relative(root: Path, relative: str | None) -> None:
    if not relative:
        return
    candidate = (root / relative).resolve()
    if root.resolve() not in candidate.parents:
        return
    candidate.unlink(missing_ok=True)
