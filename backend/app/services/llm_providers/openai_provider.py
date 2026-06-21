from typing import AsyncIterator

from openai import AsyncOpenAI

from app.config import settings
from app.services.llm_providers.base import BaseLLMProvider


class OpenAIProvider(BaseLLMProvider):
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url or None,
        )

    async def stream_chat(self, messages: list[dict], model: str | None = None) -> AsyncIterator[str]:
        model = model or settings.openai_model
        stream = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    async def chat(self, messages: list[dict], model: str | None = None) -> str:
        model = model or settings.openai_model
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
        )
        return response.choices[0].message.content or ""
