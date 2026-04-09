from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.db_models import UserRecord
from app.models import TokenPayload, User, UserInDB

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/oauth/token")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def to_user_in_db(user: UserRecord) -> UserInDB:
    return UserInDB(
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        disabled=user.disabled,
        hashed_password=user.hashed_password,
    )


def authenticate_user(db: Session, username: str, password: str) -> UserInDB | None:
    user = db.scalar(select(UserRecord).where(UserRecord.username == username))
    if not user or not verify_password(password, user.hashed_password):
        return None
    return to_user_in_db(user)


def create_access_token(subject: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {"sub": subject, "exp": expires_at}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def get_user(db: Session, username: str) -> UserInDB | None:
    user = db.scalar(select(UserRecord).where(UserRecord.username == username))
    return to_user_in_db(user) if user else None


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        token_data = TokenPayload(sub=payload["sub"])
    except (JWTError, KeyError):
        raise credentials_exception from None

    user = get_user(db, token_data.sub)
    if user is None or user.disabled:
        raise credentials_exception
    return User.model_validate(user.model_dump())
