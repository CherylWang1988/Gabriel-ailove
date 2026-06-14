import logging
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings
from typing import Any

# ── Logging setup ──────────────────────────────────────────────

LOGGING_CONFIG: dict[str, Any] = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "level": "INFO",
            "formatter": "standard",
        },
    },
    "root": {
        "level": "INFO",
        "handlers": ["console"],
    },
}


def setup_logging() -> None:
    """Configure root logger — call once at app startup."""
    logging.config.dictConfig(LOGGING_CONFIG)


# ── Settings ───────────────────────────────────────────────────

class Settings(BaseSettings):
    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/gabriel",
        description="PostgreSQL async connection string",
    )
    database_url_sync: str = Field(
        default="postgresql+psycopg2://postgres:postgres@localhost:5432/gabriel",
        description="PostgreSQL sync connection string (for Alembic)",
    )

    # LLM — provider selection
    llm_provider: str = Field(
        default="deepseek",
        pattern=r"^(deepseek|openai|claude|gemini)$",
        description="Active LLM provider",
    )
    llm_model: str = Field(default="deepseek-v4-pro")

    # DeepSeek
    deepseek_api_key: str = Field(default="")
    deepseek_base_url: str = Field(default="")

    # Google Gemini
    google_api_key: str = Field(default="", alias="google_api_key")
    gemini_api_key: str = Field(default="")
    gemini_base_url: str = Field(default="")
    gemini_model: str = Field(default="gemini-2.5-flash")

    # Anthropic Claude
    anthropic_api_key: str = Field(default="")
    anthropic_model: str = Field(default="claude-sonnet-4-6")

    # OpenAI / OpenAI-compatible (for chat)
    openai_api_key: str = Field(default="")
    openai_base_url: str = Field(default="")
    openai_model: str = Field(default="gpt-4o")

    # Embedding (OpenAI-compatible)
    embedding_api_key: str = Field(default="")
    embedding_base_url: str = Field(default="")
    embedding_model: str = Field(default="text-embedding-3-small")

    # Human-like delay before reply (seconds)
    pre_reply_delay_min: float = Field(default=2.0, ge=0)
    pre_reply_delay_max: float = Field(default=5.0, ge=0)

    # Memory
    short_term_memory_size: int = Field(default=20, ge=1)
    long_term_memory_top_k: int = Field(default=5, ge=1)

    model_config = {
        "extra": "ignore",
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    @model_validator(mode="after")
    def validate_llm_provider_key(self) -> "Settings":
        # If google_api_key is set but gemini_api_key isn't, use it as fallback
        if self.google_api_key and not self.gemini_api_key:
            object.__setattr__(self, "gemini_api_key", self.google_api_key)

        provider = self.llm_provider
        key_map: dict[str, str] = {
            "deepseek": self.deepseek_api_key,
            "openai": self.openai_api_key,
            "claude": self.anthropic_api_key,
            "gemini": self.gemini_api_key,
        }
        active_key = key_map.get(provider, "")
        if not active_key:
            # Only raise if every provider is empty — app is clearly misconfigured
            if not any(key_map.values()):
                raise ValueError(
                    "No LLM API key is configured. "
                    f"Please set the key for '{provider}' (or another provider) in .env"
                )
            # Single provider missing — log a warning, don't crash (other
            # providers may still work; the user may switch at runtime)
            import sys
            print(
                f"[config] WARNING: llm_provider='{provider}' but its API key is empty. "
                f"Set it in .env or switch providers.",
                file=sys.stderr,
            )
        return self


settings = Settings()
