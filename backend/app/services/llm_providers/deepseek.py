from typing import AsyncIterator

from openai import AsyncOpenAI

from app.config import settings
from app.services.llm_providers.base import BaseLLMProvider


class DeepSeekProvider(BaseLLMProvider):
    def __init__(self):
        base_url = settings.deepseek_base_url or "https://api.deepseek.com/v1"
        self.client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=base_url,
        )

    async def stream_chat(self, messages: list[dict], model: str | None = None) -> AsyncIterator[str]:
        model = model or settings.llm_model
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
        model = model or settings.llm_model
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
        )
        return response.choices[0].message.content or ""
