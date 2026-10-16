from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Product name lives here (backend) and in frontend/src/config.ts (UI).
PRODUCT_NAME = "AskHR"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://askhr:askhr@localhost:5432/askhr"

    admin_password: str = Field(min_length=1)
    jwt_secret: str = Field(min_length=16)
    jwt_expire_hours: int = 8

    llm_provider: str = "openai"
    llm_model: str = "gpt-4.1-mini"
    embedding_provider: str = "openai"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    openai_api_key: str = ""
    anthropic_api_key: str = ""

    top_k: int = 6
    similarity_threshold: float = 0.30

    cors_origins: str = "http://localhost:5173"
    hr_contact: str = "the HR team"

    max_upload_bytes: int = 20 * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
