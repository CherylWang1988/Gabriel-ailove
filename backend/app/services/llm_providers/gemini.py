from typing import AsyncIterator

from google import genai
from google.genai import types

from app.config import settings
from app.services.llm_providers.base import BaseLLMProvider

SAFETY_BLOCK_NONE = [
    types.SafetySetting(
        category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold=types.HarmBlockThreshold.BLOCK_NONE,
    ),
    types.SafetySetting(
        category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold=types.HarmBlockThreshold.BLOCK_NONE,
    ),
]


class GeminiProvider(BaseLLMProvider):
    def __init__(self):
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = settings.gemini_model

    def _build_contents(self, messages: list[dict]) -> tuple[str | None, list[types.Content]]:
        """Split system prompt from messages and build Gemini Content list."""
        system_instruction = None
        contents: list[types.Content] = []

        for msg in messages:
            if msg["role"] == "system":
                system_instruction = msg["content"]
            elif msg["role"] == "user":
                contents.append(types.Content(role="user", parts=[types.Part(text=msg["content"])]))
            elif msg["role"] == "assistant":
                contents.append(types.Content(role="model", parts=[types.Part(text=msg["content"])]))

        return system_instruction, contents

    def _build_config(self, system_instruction: str | None) -> types.GenerateContentConfig:
        kwargs = {"safety_settings": list(SAFETY_BLOCK_NONE)}
        if system_instruction:
            kwargs["system_instruction"] = system_instruction
        return types.GenerateContentConfig(**kwargs)

    async def stream_chat(self, messages: list[dict], model: str | None = None) -> AsyncIterator[str]:
        model = model or self.model
        system_instruction, contents = self._build_contents(messages)
        config = self._build_config(system_instruction)

        async for chunk in await self.client.aio.models.generate_content_stream(
            model=model,
            contents=contents,
            config=config,
        ):
            if chunk.text:
                yield chunk.text

    async def chat(self, messages: list[dict], model: str | None = None) -> str:
        model = model or self.model
        system_instruction, contents = self._build_contents(messages)
        config = self._build_config(system_instruction)

        response = await self.client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        return response.text or ""
