from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass
class ChatMessage:
    role: Literal["user", "assistant"]
    content: str


class LLMProvider(Protocol):
    def stream(self, system: str, messages: list[ChatMessage]) -> AsyncIterator[str]:
        ...


class EmbeddingProvider(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]:
        ...
