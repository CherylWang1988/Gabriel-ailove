from typing import AsyncIterator

from anthropic import AsyncAnthropic

from app.config import settings
from app.services.llm_providers.base import BaseLLMProvider


class ClaudeProvider(BaseLLMProvider):
    def __init__(self):
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def stream_chat(self, messages: list[dict], model: str | None = None) -> AsyncIterator[str]:
        model = model or settings.anthropic_model
        system = None
        chat_messages = []

        for msg in messages:
            if msg["role"] == "system":
                system = msg["content"]
            else:
                chat_messages.append(msg)

        kwargs = {"model": model, "messages": chat_messages, "max_tokens": 4096}
        if system:
            kwargs["system"] = system

        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    async def chat(self, messages: list[dict], model: str | None = None) -> str:
        model = model or settings.anthropic_model
        system = None
        chat_messages = []

        for msg in messages:
            if msg["role"] == "system":
                system = msg["content"]
            else:
                chat_messages.append(msg)

        kwargs = {"model": model, "messages": chat_messages, "max_tokens": 4096}
        if system:
            kwargs["system"] = system

        response = await self.client.messages.create(**kwargs)
        return response.content[0].text if response.content else ""
