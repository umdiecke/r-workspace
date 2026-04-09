from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "R.Workspace"
    app_version: str = "1.2.0"
    secret_key: str = "change-this-in-production"
    access_token_expire_minutes: int = 30
    jwt_algorithm: str = "HS256"
    cors_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "postgresql+psycopg://umdiecke:umdiecke@db:5432/umdiecke"

    model_config = SettingsConfigDict(env_prefix="UMDIECKE_", case_sensitive=False)


settings = Settings()
