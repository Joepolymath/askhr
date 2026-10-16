from functools import lru_cache

from app.config import get_settings
from app.providers.base import EmbeddingProvider, LLMProvider


def _require(key: str, name: str) -> str:
    if not key:
        raise ValueError(f"{name} is not set. Add it to .env and recreate the backend: docker compose up -d backend")
    return key


@lru_cache
def get_llm() -> LLMProvider:
    s = get_settings()
    match s.llm_provider:
        case "openai":
            from app.providers.openai_ import OpenAILLM

            return OpenAILLM(_require(s.openai_api_key, "OPENAI_API_KEY"), s.llm_model)
        case "anthropic":
            from app.providers.anthropic_ import AnthropicLLM

            return AnthropicLLM(_require(s.anthropic_api_key, "ANTHROPIC_API_KEY"), s.llm_model)
        case "fake":
            from app.providers.fake import FakeLLM

            return FakeLLM()
    raise ValueError(f"Unknown LLM_PROVIDER: {s.llm_provider}")


@lru_cache
def get_embedder() -> EmbeddingProvider:
    s = get_settings()
    match s.embedding_provider:
        case "openai":
            from app.providers.openai_ import OpenAIEmbeddings

            return OpenAIEmbeddings(_require(s.openai_api_key, "OPENAI_API_KEY"), s.embedding_model, s.embedding_dimensions)
        case "fake":
            from app.providers.fake import FakeEmbeddings

            return FakeEmbeddings(s.embedding_dimensions)
    raise ValueError(f"Unknown EMBEDDING_PROVIDER: {s.embedding_provider}")
