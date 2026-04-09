from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "R.Workspace"
    app_version: str = "1.3.0"
    secret_key: str = "change-this-in-production"
    access_token_expire_minutes: int = 30
    jwt_algorithm: str = "HS256"
    cors_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "postgresql+psycopg://umdiecke:umdiecke@db:5432/umdiecke"
    smtp_host: str = "mailhog"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_sender: str = "noreply@rworkspace.local"
    smtp_starttls: bool = False

    model_config = SettingsConfigDict(env_prefix="UMDIECKE_", case_sensitive=False)


settings = Settings()
