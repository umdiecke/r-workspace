from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings
from app.models import TokenPayload, User, UserInDB

# Use pbkdf2_sha256 to avoid bcrypt runtime compatibility issues in lightweight containers.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/oauth/token")

DEMO_USER = UserInDB(
    username="admin",
    full_name="Umdiecke Administrator",
    hashed_password=pwd_context.hash("changeit"),
    disabled=False,
)

FAKE_USERS_DB = {DEMO_USER.username: DEMO_USER}


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def authenticate_user(username: str, password: str) -> UserInDB | None:
    user = FAKE_USERS_DB.get(username)
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


def create_access_token(subject: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {"sub": subject, "exp": expires_at}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def get_user(username: str) -> UserInDB | None:
    return FAKE_USERS_DB.get(username)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
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

    user = get_user(token_data.sub)
    if user is None or user.disabled:
        raise credentials_exception
    return User.model_validate(user.model_dump())
