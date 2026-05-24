from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/gabriel"
    database_url_sync: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/gabriel"

    # LLM - provider selection
    llm_provider: str = "deepseek"  # deepseek | openai | claude
    llm_model: str = "deepseek-v4-pro"

    # DeepSeek
    deepseek_api_key: str = ""
    deepseek_base_url: str = ""

    # Anthropic Claude
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # OpenAI / OpenAI-compatible (for chat)
    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = "gpt-4o"

    # Embedding (OpenAI-compatible)
    embedding_api_key: str = ""
    embedding_base_url: str = ""
    embedding_model: str = "text-embedding-3-small"

    # Memory
    short_term_memory_size: int = 20
    long_term_memory_top_k: int = 5

    class Config:
        env_file = ".env"


settings = Settings()
