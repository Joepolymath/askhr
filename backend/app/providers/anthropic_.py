from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic

from app.providers.base import ChatMessage


class AnthropicLLM:
    def __init__(self, api_key: str, model: str) -> None:
        self.client = AsyncAnthropic(api_key=api_key)
        self.model = model

    async def stream(self, system: str, messages: list[ChatMessage]) -> AsyncIterator[str]:
        async with self.client.messages.stream(
            model=self.model,
            max_tokens=1024,
            system=system,
            messages=[{"role": m.role, "content": m.content} for m in messages],
        ) as stream:
            async for text in stream.text_stream:
                yield text
