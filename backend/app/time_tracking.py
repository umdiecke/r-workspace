from __future__ import annotations

from datetime import UTC, datetime
from io import StringIO

from sqlalchemy import Select, desc, extract, func, select
from sqlalchemy.orm import Session

from app.db_models import TimeEntry
from app.models import TimeEntryResponse


def utc_now() -> datetime:
    return datetime.now(UTC)


def serialize_time_entry(entry: TimeEntry) -> TimeEntryResponse:
    end_time = entry.end_time
    duration_target = end_time or utc_now()
    duration_hours = round((duration_target - entry.start_time).total_seconds() / 3600, 2)

    return TimeEntryResponse(
        id=entry.id,
        project_name=entry.project_name,
        activity_description=entry.activity_description,
        start_time=entry.start_time,
        end_time=end_time,
        start_day=entry.start_time.date().isoformat(),
        start_clock_time=entry.start_time.strftime("%H:%M:%S"),
        end_day=end_time.date().isoformat() if end_time else None,
        end_clock_time=end_time.strftime("%H:%M:%S") if end_time else None,
        duration_hours=duration_hours,
        is_running=end_time is None,
    )


def active_entry_query(username: str) -> Select[tuple[TimeEntry]]:
    return (
        select(TimeEntry)
        .where(TimeEntry.owner_username == username, TimeEntry.end_time.is_(None))
        .order_by(desc(TimeEntry.start_time))
        .limit(1)
    )


def get_active_entry(db: Session, username: str) -> TimeEntry | None:
    return db.scalar(active_entry_query(username))


def get_previous_project_name(db: Session, username: str) -> str | None:
    return db.scalar(
        select(TimeEntry.project_name)
        .where(
            TimeEntry.owner_username == username,
            TimeEntry.project_name.is_not(None),
            TimeEntry.project_name != "",
        )
        .order_by(desc(TimeEntry.end_time), desc(TimeEntry.start_time))
        .limit(1)
    )


def get_project_suggestions(db: Session, username: str) -> list[str]:
    rows = db.execute(
        select(TimeEntry.project_name)
        .where(
            TimeEntry.owner_username == username,
            TimeEntry.project_name.is_not(None),
            TimeEntry.project_name != "",
        )
        .distinct()
        .order_by(TimeEntry.project_name.asc())
    )
    return [row[0] for row in rows if row[0]]


def build_filtered_entries_query(
    username: str,
    project_name: str | None,
    year: int | None,
    month: int | None,
    day: int | None,
) -> Select[tuple[TimeEntry]]:
    query = select(TimeEntry).where(TimeEntry.owner_username == username)

    if project_name:
        query = query.where(TimeEntry.project_name.ilike(f"%{project_name}%"))
    if year is not None:
        query = query.where(extract("year", TimeEntry.start_time) == year)
    if month is not None:
        query = query.where(extract("month", TimeEntry.start_time) == month)
    if day is not None:
        query = query.where(extract("day", TimeEntry.start_time) == day)

    return query.order_by(desc(TimeEntry.start_time), desc(TimeEntry.id))


def export_entries_to_csv(entries: list[TimeEntryResponse]) -> str:
    buffer = StringIO()
    headers = [
        "id",
        "start_day",
        "start_time",
        "end_day",
        "end_time",
        "project_name",
        "activity_description",
        "duration_hours",
        "is_running",
    ]
    buffer.write(",".join(headers) + "\n")

    for entry in entries:
        values = [
            str(entry.id),
            entry.start_day,
            entry.start_clock_time,
            entry.end_day or "",
            entry.end_clock_time or "",
            (entry.project_name or "").replace('"', '""'),
            (entry.activity_description or "").replace('"', '""'),
            f"{entry.duration_hours:.2f}",
            "true" if entry.is_running else "false",
        ]
        escaped = [f'"{value}"' if "," in value or '"' in value or "\n" in value else value for value in values]
        buffer.write(",".join(escaped) + "\n")

    return buffer.getvalue()


def count_entries(db: Session, filtered_query: Select[tuple[TimeEntry]]) -> int:
    subquery = filtered_query.order_by(None).subquery()
    return db.scalar(select(func.count()).select_from(subquery)) or 0
