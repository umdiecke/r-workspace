from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, SessionLocal, engine, get_db
from app.db_models import TimeEntry, UserRecord
from app.emailing import generate_temporary_password, send_password_reset_email
from app.models import (
    ActiveTimeEntryResponse,
    AccountEmailUpdateRequest,
    AccountPasswordUpdateRequest,
    HeartbeatResponse,
    MessageResponse,
    PasswordResetRequest,
    ProjectSuggestionsResponse,
    TimeEntryListResponse,
    TimeEntryResponse,
    TimeEntryStartResponse,
    TimeEntryStopRequest,
    TimeEntryUpdateRequest,
    Token,
    User,
    UserRegisterRequest,
)
from app.security import (
    authenticate_user,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
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
    with SessionLocal() as db:
        admin_user = db.scalar(select(UserRecord).where(UserRecord.username == "admin"))
        if admin_user is None:
            db.add(
                UserRecord(
                    username="admin",
                    email="admin@rworkspace.local",
                    full_name="R.Workspace Administrator",
                    hashed_password=hash_password("changeit"),
                    disabled=False,
                )
            )
            db.commit()
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
    with SessionLocal() as db:
        user = authenticate_user(db, form_data.username, form_data.password)
    if user is None:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(user.username)
    return Token(access_token=access_token, token_type="bearer")


@app.post(
    "/api/auth/register",
    tags=["Authentication"],
    response_model=User,
    summary="Register a new user",
    status_code=status.HTTP_201_CREATED,
)
async def register_user(
    payload: UserRegisterRequest,
    db: Session = Depends(get_db),
) -> User:
    if db.scalar(select(UserRecord).where(UserRecord.username == payload.username)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")
    if db.scalar(select(UserRecord).where(UserRecord.email == payload.email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.")

    user = UserRecord(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        disabled=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return User.model_validate(
        {
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "disabled": user.disabled,
        }
    )


@app.post(
    "/api/auth/password-reset",
    tags=["Authentication"],
    response_model=MessageResponse,
    summary="Reset password and send a temporary password by email",
)
async def reset_password(
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
) -> MessageResponse:
    user = db.scalar(select(UserRecord).where(UserRecord.email == payload.email))
    if user is None:
        return MessageResponse(message="If the address exists, a new password has been sent.")

    temporary_password = generate_temporary_password()
    user.hashed_password = hash_password(temporary_password)
    db.commit()
    send_password_reset_email(user.email, user.username, temporary_password)
    return MessageResponse(message="If the address exists, a new password has been sent.")


@app.get(
    "/api/me",
    tags=["Users"],
    response_model=User,
    summary="Get the current authenticated user",
)
async def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@app.put(
    "/api/account/email",
    tags=["Users"],
    response_model=User,
    summary="Update the email address of the current user",
)
async def update_account_email(
    payload: AccountEmailUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    existing = db.scalar(select(UserRecord).where(UserRecord.email == payload.email))
    if existing is not None and existing.username != current_user.username:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.")

    user = db.scalar(select(UserRecord).where(UserRecord.username == current_user.username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.email = payload.email
    db.commit()
    db.refresh(user)
    return User.model_validate(
        {
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "disabled": user.disabled,
        }
    )


@app.put(
    "/api/account/password",
    tags=["Users"],
    response_model=MessageResponse,
    summary="Update the password of the current user",
)
async def update_account_password(
    payload: AccountPasswordUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    user = db.scalar(select(UserRecord).where(UserRecord.username == current_user.username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect.")

    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="Password updated successfully.")


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


@app.put(
    "/api/time-entries/{entry_id}",
    tags=["Time Tracking"],
    response_model=TimeEntryResponse,
    summary="Edit a recorded time entry",
)
async def update_time_entry(
    entry_id: int,
    payload: TimeEntryUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TimeEntryResponse:
    entry = db.get(TimeEntry, entry_id)
    if entry is None or entry.owner_username != current_user.username:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time entry not found.")
    if entry.end_time is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Running entries cannot be edited.")
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="End time must be after start time.")

    entry.start_time = payload.start_time
    entry.end_time = payload.end_time
    entry.project_name = (payload.project_name or "").strip() or None
    entry.activity_description = (payload.activity_description or "").strip() or None
    db.commit()
    db.refresh(entry)
    return serialize_time_entry(entry)


@app.delete(
    "/api/time-entries/{entry_id}",
    tags=["Time Tracking"],
    response_model=MessageResponse,
    summary="Delete a recorded time entry",
)
async def delete_time_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    entry = db.get(TimeEntry, entry_id)
    if entry is None or entry.owner_username != current_user.username:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time entry not found.")
    db.delete(entry)
    db.commit()
    return MessageResponse(message="Time entry deleted successfully.")


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
