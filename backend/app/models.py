from datetime import datetime

from pydantic import BaseModel, Field


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenPayload(BaseModel):
    sub: str


class User(BaseModel):
    username: str
    full_name: str
    disabled: bool = False


class UserInDB(User):
    hashed_password: str


class HeartbeatResponse(BaseModel):
    name: str
    version: str


class TimeEntryBase(BaseModel):
    project_name: str | None = Field(default=None, max_length=255)
    activity_description: str | None = None


class TimeEntryStartResponse(BaseModel):
    id: int
    start_time: datetime
    is_running: bool


class TimeEntryStopRequest(TimeEntryBase):
    project_name: str


class TimeEntryResponse(TimeEntryBase):
    id: int
    start_time: datetime
    end_time: datetime | None
    start_day: str
    start_clock_time: str
    end_day: str | None
    end_clock_time: str | None
    duration_hours: float
    is_running: bool


class TimeEntryListResponse(BaseModel):
    items: list[TimeEntryResponse]
    total: int
    page: int
    page_size: int
    project_suggestions: list[str]
    previous_project_name: str | None


class ActiveTimeEntryResponse(BaseModel):
    entry: TimeEntryResponse | None
    previous_project_name: str | None


class ProjectSuggestionsResponse(BaseModel):
    projects: list[str]
