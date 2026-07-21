from __future__ import annotations

import json
from collections.abc import Generator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload, sessionmaker

from .config import Settings, load_settings
from .database import Base, make_engine
from .models import Flight, Moment, Photo
from .schemas import (
    FlightInput,
    FlightSummary,
    MomentInput,
    MomentOut,
    MomentPatch,
    PhotoMetadata,
    PhotoOut,
    PhotoPatch,
    RenameFlight,
    StoredFlight,
)
from .storage import delete_relative, ensure_storage, save_upload


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    engine = make_engine(settings)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        ensure_storage(settings.photo_root)
        Base.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(title="flight-viewer API", version="1.0.0", lifespan=lifespan)
    if settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.allowed_origins),
            allow_origin_regex=settings.allowed_origin_regex,
            allow_credentials=False,
            allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type"],
        )

    def get_session() -> Generator[Session, None, None]:
        with sessions() as session:
            yield session

    def get_flight_or_404(session: Session, flight_id: str) -> Flight:
        flight = session.get(Flight, flight_id)
        if not flight:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Flight not found.")
        return flight

    def get_moment_or_404(session: Session, moment_id: str) -> Moment:
        moment = session.get(Moment, moment_id)
        if not moment:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found.")
        return moment

    def get_photo_or_404(session: Session, photo_id: str) -> Photo:
        photo = session.get(Photo, photo_id)
        if not photo:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found.")
        return photo

    def moment_out(moment: Moment) -> MomentOut:
        return MomentOut.model_validate(moment).model_copy(
            update={"photo_ids": [photo.id for photo in moment.photos]}
        )

    def media_url(request: Request, route_name: str, photo_id: str) -> str:
        path = request.url_for(route_name, photo_id=photo_id).path
        return f"{settings.public_base_url}{path}" if settings.public_base_url else path

    def photo_out(request: Request, photo: Photo) -> PhotoOut:
        return PhotoOut.model_validate(
            {
                **{column.name: getattr(photo, column.name) for column in Photo.__table__.columns},
                "original_url": media_url(request, "get_photo_original", photo.id),
                "thumbnail_url": media_url(request, "get_photo_thumbnail", photo.id)
                if photo.thumbnail_path
                else None,
            }
        )

    @app.get("/health")
    def health(session: Session = Depends(get_session)):
        session.execute(text("SELECT 1"))
        return {"status": "ok", "service": "flight-viewer"}

    @app.get("/flights", response_model=list[FlightSummary], response_model_by_alias=True)
    def list_flights(session: Session = Depends(get_session)):
        return session.scalars(select(Flight).order_by(Flight.start_time_ms.desc())).all()

    @app.get("/flights/by-hash/{flight_hash}", response_model=FlightSummary | None, response_model_by_alias=True)
    def find_flight_by_hash(flight_hash: str, session: Session = Depends(get_session)):
        return session.scalar(select(Flight).where(Flight.hash == flight_hash))

    @app.get("/flights/{flight_id}", response_model=StoredFlight, response_model_by_alias=True)
    def get_flight(flight_id: str, session: Session = Depends(get_session)):
        return get_flight_or_404(session, flight_id)

    @app.post(
        "/flights",
        response_model=StoredFlight,
        response_model_by_alias=True,
        status_code=status.HTTP_201_CREATED,
    )
    def create_flight(payload: FlightInput, session: Session = Depends(get_session)):
        if len(payload.igc_text.encode("utf-8")) > settings.max_igc_bytes:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "IGC file exceeds the size limit.")
        flight = Flight(**payload.model_dump())
        session.add(flight)
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "A flight with this hash already exists.") from error
        return flight

    @app.patch("/flights/{flight_id}", response_model=FlightSummary, response_model_by_alias=True)
    def rename_flight(flight_id: str, payload: RenameFlight, session: Session = Depends(get_session)):
        flight = get_flight_or_404(session, flight_id)
        flight.title = payload.title.strip()
        session.commit()
        return flight

    @app.delete("/flights/{flight_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_flight(flight_id: str, session: Session = Depends(get_session)):
        flight = session.scalar(
            select(Flight).where(Flight.id == flight_id).options(selectinload(Flight.photos))
        )
        if not flight:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Flight not found.")
        paths = [(photo.original_path, photo.thumbnail_path) for photo in flight.photos]
        session.delete(flight)
        session.commit()
        for original_path, thumbnail_path in paths:
            delete_relative(settings.photo_root, original_path)
            delete_relative(settings.photo_root, thumbnail_path)

    @app.get(
        "/flights/{flight_id}/moments",
        response_model=list[MomentOut],
        response_model_by_alias=True,
    )
    def list_moments(flight_id: str, session: Session = Depends(get_session)):
        get_flight_or_404(session, flight_id)
        moments = session.scalars(
            select(Moment)
            .where(Moment.flight_id == flight_id)
            .options(selectinload(Moment.photos))
            .order_by(Moment.time_ms)
        ).all()
        return [moment_out(moment) for moment in moments]

    @app.post(
        "/flights/{flight_id}/moments",
        response_model=MomentOut,
        response_model_by_alias=True,
        status_code=status.HTTP_201_CREATED,
    )
    def create_moment(flight_id: str, payload: MomentInput, session: Session = Depends(get_session)):
        get_flight_or_404(session, flight_id)
        if payload.flight_id != flight_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Flight IDs do not match.")
        if payload.comment_text and len(payload.comment_text) > settings.max_comment_length:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Comment exceeds the length limit.")
        moment = Moment(**payload.model_dump())
        session.add(moment)
        session.commit()
        session.refresh(moment)
        return moment_out(moment)

    @app.patch("/moments/{moment_id}", response_model=MomentOut, response_model_by_alias=True)
    def update_moment(moment_id: str, payload: MomentPatch, session: Session = Depends(get_session)):
        moment = get_moment_or_404(session, moment_id)
        changes = payload.model_dump(exclude_unset=True)
        comment = changes.get("comment_text")
        if comment and len(comment) > settings.max_comment_length:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Comment exceeds the length limit.")
        for key, value in changes.items():
            if value is not None or key == "comment_text":
                setattr(moment, key, value)
        session.commit()
        session.refresh(moment)
        return moment_out(moment)

    @app.delete("/moments/{moment_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_moment(moment_id: str, session: Session = Depends(get_session)):
        moment = session.scalar(
            select(Moment).where(Moment.id == moment_id).options(selectinload(Moment.photos))
        )
        if not moment:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found.")
        paths = [(photo.original_path, photo.thumbnail_path) for photo in moment.photos]
        session.delete(moment)
        session.commit()
        for original_path, thumbnail_path in paths:
            delete_relative(settings.photo_root, original_path)
            delete_relative(settings.photo_root, thumbnail_path)

    @app.get(
        "/flights/{flight_id}/photos",
        response_model=list[PhotoOut],
        response_model_by_alias=True,
    )
    def list_photos(flight_id: str, request: Request, session: Session = Depends(get_session)):
        get_flight_or_404(session, flight_id)
        photos = session.scalars(
            select(Photo).where(Photo.flight_id == flight_id).order_by(Photo.created_at)
        ).all()
        return [photo_out(request, photo) for photo in photos]

    @app.post(
        "/flights/{flight_id}/photos",
        response_model=PhotoOut,
        response_model_by_alias=True,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_photo(
        flight_id: str,
        request: Request,
        metadata: str = Form(...),
        original: UploadFile = File(...),
        thumbnail: UploadFile | None = File(default=None),
        session: Session = Depends(get_session),
    ):
        get_flight_or_404(session, flight_id)
        try:
            parsed = PhotoMetadata.model_validate(json.loads(metadata))
        except (json.JSONDecodeError, ValidationError) as error:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid photo metadata.") from error
        if parsed.flight_id != flight_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Flight IDs do not match.")
        moment = get_moment_or_404(session, parsed.moment_id)
        if moment.flight_id != flight_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Comment does not belong to this flight.")
        used_bytes = session.scalar(
            select(func.coalesce(func.sum(Photo.size_bytes), 0)).where(Photo.flight_id == flight_id)
        ) or 0
        if used_bytes + parsed.size_bytes > settings.max_photo_bytes_per_flight:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Flight photo storage limit exceeded.")

        original_path, actual_size = await save_upload(
            original,
            settings.photo_root,
            "originals",
            parsed.mime_type,
            settings.max_photo_bytes,
        )
        thumbnail_path: str | None = None
        try:
            if used_bytes + actual_size > settings.max_photo_bytes_per_flight:
                raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Flight photo storage limit exceeded.")
            if thumbnail:
                thumbnail_path, _ = await save_upload(
                    thumbnail,
                    settings.photo_root,
                    "thumbnails",
                    "image/jpeg",
                    2 * 1024 * 1024,
                )
            photo = Photo(
                **parsed.model_dump(exclude={"size_bytes"}),
                size_bytes=actual_size,
                original_path=original_path,
                thumbnail_path=thumbnail_path,
            )
            session.add(photo)
            session.commit()
            return photo_out(request, photo)
        except Exception:
            session.rollback()
            delete_relative(settings.photo_root, original_path)
            delete_relative(settings.photo_root, thumbnail_path)
            raise

    @app.patch("/photos/{photo_id}", response_model=PhotoOut, response_model_by_alias=True)
    def update_photo(
        photo_id: str,
        payload: PhotoPatch,
        request: Request,
        session: Session = Depends(get_session),
    ):
        photo = get_photo_or_404(session, photo_id)
        for key, value in payload.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(photo, key, value)
        session.commit()
        return photo_out(request, photo)

    @app.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_photo(photo_id: str, session: Session = Depends(get_session)):
        photo = get_photo_or_404(session, photo_id)
        paths = (photo.original_path, photo.thumbnail_path)
        session.delete(photo)
        session.commit()
        delete_relative(settings.photo_root, paths[0])
        delete_relative(settings.photo_root, paths[1])

    @app.get("/photos/{photo_id}/original", name="get_photo_original")
    def get_photo_original(photo_id: str, session: Session = Depends(get_session)):
        photo = get_photo_or_404(session, photo_id)
        return photo_file(settings.photo_root, photo.original_path, photo.mime_type, photo.filename)

    @app.get("/photos/{photo_id}/thumbnail", name="get_photo_thumbnail")
    def get_photo_thumbnail(photo_id: str, session: Session = Depends(get_session)):
        photo = get_photo_or_404(session, photo_id)
        if not photo.thumbnail_path:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Thumbnail not found.")
        return photo_file(settings.photo_root, photo.thumbnail_path, "image/jpeg", f"{photo.filename}.thumb.jpg")

    return app


def photo_file(root: Path, relative: str, mime_type: str, filename: str) -> FileResponse:
    path = (root / relative).resolve()
    if root.resolve() not in path.parents or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo file not found.")
    return FileResponse(path, media_type=mime_type, filename=filename, content_disposition_type="inline")


app = create_app()
