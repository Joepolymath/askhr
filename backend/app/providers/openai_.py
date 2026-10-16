from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.providers.base import ChatMessage

# OpenAI accepts up to 2048 inputs per request; smaller batches keep each
# request well under the per-request token limit for ~800-token chunks.
EMBED_BATCH = 100


class OpenAILLM:
    def __init__(self, api_key: str, model: str) -> None:
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    async def stream(self, system: str, messages: list[ChatMessage]) -> AsyncIterator[str]:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}]
            + [{"role": m.role, "content": m.content} for m in messages],
            temperature=0,  # factual Q&A: we want the same answer every time
            stream=True,
        )
        # `async with` closes the HTTP stream even when the caller stops early
        # (e.g. after detecting the NO_ANSWER sentinel).
        async with response:
            async for event in response:
                if event.choices and event.choices[0].delta.content:
                    yield event.choices[0].delta.content


class OpenAIEmbeddings:
    def __init__(self, api_key: str, model: str, dimensions: int) -> None:
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model
        self.dimensions = dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), EMBED_BATCH):
            batch = texts[i : i + EMBED_BATCH]
            resp = await self.client.embeddings.create(
                model=self.model, input=batch, dimensions=self.dimensions
            )
            out.extend(d.embedding for d in sorted(resp.data, key=lambda d: d.index))
        return out
