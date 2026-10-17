import hashlib
import math
import re
from collections.abc import AsyncIterator, Callable

from app.providers.base import ChatMessage

_WORD = re.compile(r"[a-z0-9]+")


class FakeEmbeddings:
    """Hashed bag-of-words vectors: texts sharing words get high cosine similarity."""

    def __init__(self, dimensions: int) -> None:
        self.dimensions = dimensions

    def _vec(self, text: str) -> list[float]:
        v = [0.0] * self.dimensions
        for word in _WORD.findall(text.lower()):
            h = int.from_bytes(hashlib.md5(word.encode()).digest()[:4], "little")
            v[h % self.dimensions] += 1.0
        norm = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norm for x in v]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]


class FakeLLM:
    """Returns a scripted reply. Tests can set `responder` to inspect the prompt."""

    def __init__(self) -> None:
        self.responder: Callable[[str, list[ChatMessage]], str] = lambda system, msgs: "NO_ANSWER"
        self.last_system: str | None = None

    async def stream(self, system: str, messages: list[ChatMessage]) -> AsyncIterator[str]:
        self.last_system = system
        reply = self.responder(system, messages)
        for i in range(0, len(reply), 4):
            yield reply[i : i + 4]
