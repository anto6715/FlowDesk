from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Flow Desk"
    app_version: str = "0.1.0"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./flowdesk.db"
    database_echo: bool = False

    model_config = SettingsConfigDict(
        env_prefix="FLOWDESK_",
        extra="ignore",
        env_file=".env",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
