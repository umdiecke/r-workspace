from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, get_db
from app.db_models import TimeEntry
from app.models import (
    ActiveTimeEntryResponse,
    HeartbeatResponse,
    ProjectSuggestionsResponse,
    TimeEntryListResponse,
    TimeEntryResponse,
    TimeEntryStartResponse,
    TimeEntryStopRequest,
    Token,
    User,
)
from app.security import authenticate_user, create_access_token, get_current_user
from app.time_tracking import (
    build_filtered_entries_query,
    count_entries,
    export_entries_to_csv,
    get_active_entry,
    get_previous_project_name,
    get_project_suggestions,
    serialize_time_entry,
    utc_now,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title=settings.service_name,
    version=settings.app_version,
    summary="Accessible multilingual workspace starter with FastAPI and React.",
    description=(
        "R.Workspace exposes a public heartbeat endpoint and protected API "
        "endpoints secured with OAuth2 bearer tokens, including time tracking "
        "capabilities documented through OpenAPI."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(
    "/api/heartbeat",
    tags=["System"],
    response_model=HeartbeatResponse,
    summary="Public heartbeat endpoint",
)
async def heartbeat() -> HeartbeatResponse:
    return HeartbeatResponse(name=settings.service_name, version=settings.app_version)


@app.post(
    "/oauth/token",
    tags=["Authentication"],
    response_model=Token,
    summary="Issue an OAuth2 access token",
)
async def login(form_data: OAuth2PasswordRequestForm = Depends()) -> Token:
    user = authenticate_user(form_data.username, form_data.password)
    if user is None:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(user.username)
    return Token(access_token=access_token, token_type="bearer")


@app.get(
    "/api/me",
    tags=["Users"],
    response_model=User,
    summary="Get the current authenticated user",
)
async def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@app.get(
    "/api/projects",
    tags=["Time Tracking"],
    response_model=ProjectSuggestionsResponse,
    summary="List remembered project names",
)
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectSuggestionsResponse:
    return ProjectSuggestionsResponse(projects=get_project_suggestions(db, current_user.username))


@app.get(
    "/api/time-entries/active",
    tags=["Time Tracking"],
    response_model=ActiveTimeEntryResponse,
    summary="Get the current running time entry",
)
async def get_active_time_entry(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActiveTimeEntryResponse:
    active_entry = get_active_entry(db, current_user.username)
    return ActiveTimeEntryResponse(
        entry=serialize_time_entry(active_entry) if active_entry else None,
        previous_project_name=get_previous_project_name(db, current_user.username),
    )


@app.post(
    "/api/time-entries/start",
    tags=["Time Tracking"],
    response_model=TimeEntryStartResponse,
    summary="Start time tracking",
    status_code=status.HTTP_201_CREATED,
)
async def start_time_entry(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TimeEntryStartResponse:
    existing_entry = get_active_entry(db, current_user.username)
    if existing_entry is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A time entry is already running.",
        )

    entry = TimeEntry(
        owner_username=current_user.username,
        start_time=utc_now(),
        end_time=None,
        project_name=None,
        activity_description=None,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return TimeEntryStartResponse(id=entry.id, start_time=entry.start_time, is_running=True)


@app.post(
    "/api/time-entries/{entry_id}/stop",
    tags=["Time Tracking"],
    response_model=TimeEntryResponse,
    summary="Stop a running time entry and store details",
)
async def stop_time_entry(
    entry_id: int,
    payload: TimeEntryStopRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TimeEntryResponse:
    entry = db.get(TimeEntry, entry_id)
    if entry is None or entry.owner_username != current_user.username:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time entry not found.")
    if entry.end_time is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Time entry has already been stopped.",
        )

    normalized_project_name = payload.project_name.strip()
    if not normalized_project_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Project name must not be empty.",
        )

    entry.end_time = utc_now()
    entry.project_name = normalized_project_name
    entry.activity_description = (payload.activity_description or "").strip() or None
    db.commit()
    db.refresh(entry)
    return serialize_time_entry(entry)


@app.get(
    "/api/time-entries",
    tags=["Time Tracking"],
    response_model=TimeEntryListResponse,
    summary="List time entries with filters and paging",
)
async def list_time_entries(
    project_name: str | None = Query(default=None),
    year: int | None = Query(default=None, ge=2000, le=9999),
    month: int | None = Query(default=None, ge=1, le=12),
    day: int | None = Query(default=None, ge=1, le=31),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TimeEntryListResponse:
    filtered_query = build_filtered_entries_query(
        current_user.username,
        project_name,
        year,
        month,
        day,
    )
    total = count_entries(db, filtered_query)
    entries = db.scalars(filtered_query.offset((page - 1) * page_size).limit(page_size)).all()

    return TimeEntryListResponse(
        items=[serialize_time_entry(entry) for entry in entries],
        total=total,
        page=page,
        page_size=page_size,
        project_suggestions=get_project_suggestions(db, current_user.username),
        previous_project_name=get_previous_project_name(db, current_user.username),
    )


@app.get(
    "/api/time-entries/export",
    tags=["Time Tracking"],
    summary="Export filtered time entries as CSV",
    response_class=Response,
)
async def export_time_entries(
    project_name: str | None = Query(default=None),
    year: int | None = Query(default=None, ge=2000, le=9999),
    month: int | None = Query(default=None, ge=1, le=12),
    day: int | None = Query(default=None, ge=1, le=31),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    filtered_query = build_filtered_entries_query(
        current_user.username,
        project_name,
        year,
        month,
        day,
    )
    entries = db.scalars(filtered_query).all()
    csv_content = export_entries_to_csv([serialize_time_entry(entry) for entry in entries])

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="time-entries.csv"'},
    )
