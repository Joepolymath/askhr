"""Provider interfaces.

The RAG pipeline only depends on these two protocols, so swapping OpenAI for
Anthropic (or a local model) is a config change, not a code change.
"""
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass
class ChatMessage:
    role: Literal["user", "assistant"]
    content: str


class LLMProvider(Protocol):
    def stream(self, system: str, messages: list[ChatMessage]) -> AsyncIterator[str]:
        """Yield the answer as text fragments."""
        ...


class EmbeddingProvider(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding per input text, in order."""
        ...
