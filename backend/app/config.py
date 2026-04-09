from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "R.Workspace"
    app_version: str = "1.4.0"
    secret_key: str = "change-this-in-production"
    access_token_expire_minutes: int = 30
    jwt_algorithm: str = "HS256"
    cors_origins: list[str] = ["http://localhost:5173"]
    cors_origin_regex: str = (
        r"^https?://("
        r"localhost|127\.0\.0\.1|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
        r")(:\d+)?$"
    )
    database_url: str = "postgresql+psycopg://umdiecke:umdiecke@db:5432/umdiecke"
    smtp_host: str = "mailhog"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_sender: str = "noreply@rworkspace.example.com"
    smtp_starttls: bool = False

    model_config = SettingsConfigDict(env_prefix="UMDIECKE_", case_sensitive=False)


settings = Settings()
