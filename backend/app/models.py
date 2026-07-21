from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class Flight(Base):
    __tablename__ = "flights"

    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: new_id("flight"))
    hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    pilot_name: Mapped[str] = mapped_column(String(255))
    start_time_ms: Mapped[int] = mapped_column(BigInteger)
    end_time_ms: Mapped[int] = mapped_column(BigInteger)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    min_altitude: Mapped[float] = mapped_column(Float)
    max_altitude: Mapped[float] = mapped_column(Float)
    total_distance_meters: Mapped[float] = mapped_column(Float)
    optimized_distance_meters: Mapped[float] = mapped_column(Float)
    start_lat: Mapped[float] = mapped_column(Float)
    start_lng: Mapped[float] = mapped_column(Float)
    start_location_label: Mapped[str] = mapped_column(String(255))
    start_place_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    igc_text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    moments: Mapped[list[Moment]] = relationship(back_populates="flight", cascade="all, delete-orphan")
    photos: Mapped[list[Photo]] = relationship(back_populates="flight", cascade="all, delete-orphan")


class Moment(Base):
    __tablename__ = "moments"

    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: new_id("comment"))
    flight_id: Mapped[str] = mapped_column(ForeignKey("flights.id", ondelete="CASCADE"), index=True)
    fix_index: Mapped[int] = mapped_column(Integer)
    elapsed_seconds: Mapped[float] = mapped_column(Float)
    time_ms: Mapped[int] = mapped_column(BigInteger, index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    altitude: Mapped[float] = mapped_column(Float)
    comment_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    flight: Mapped[Flight] = relationship(back_populates="moments")
    photos: Mapped[list[Photo]] = relationship(back_populates="moment", cascade="all, delete-orphan")


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: new_id("photo"))
    flight_id: Mapped[str] = mapped_column(ForeignKey("flights.id", ondelete="CASCADE"), index=True)
    moment_id: Mapped[str] = mapped_column(ForeignKey("moments.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    original_path: Mapped[str] = mapped_column(String(255), unique=True)
    thumbnail_path: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    exif_time_ms: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    resolved_time_ms: Mapped[int] = mapped_column(BigInteger)
    exif_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    exif_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    placement_source: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    flight: Mapped[Flight] = relationship(back_populates="photos")
    moment: Mapped[Moment] = relationship(back_populates="photos")
