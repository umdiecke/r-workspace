from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenPayload(BaseModel):
    sub: str


class User(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    disabled: bool = False


class UserInDB(User):
    hashed_password: str


class UserRegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class AccountEmailUpdateRequest(BaseModel):
    email: EmailStr


class AccountPasswordUpdateRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=8, max_length=255)


class MessageResponse(BaseModel):
    message: str


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


class TimeEntryUpdateRequest(TimeEntryBase):
    start_time: datetime
    end_time: datetime


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
