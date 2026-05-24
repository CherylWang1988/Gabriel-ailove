from typing import AsyncIterator

from app.config import settings
from app.models.persona import Persona
from app.models.message import Message
from app.services.llm_providers.base import BaseLLMProvider


def _get_provider() -> BaseLLMProvider:
    match settings.llm_provider:
        case "claude":
            from app.services.llm_providers.claude import ClaudeProvider
            return ClaudeProvider()
        case "openai":
            from app.services.llm_providers.openai_provider import OpenAIProvider
            return OpenAIProvider()
        case _:
            from app.services.llm_providers.deepseek import DeepSeekProvider
            return DeepSeekProvider()


class LLMService:
    def __init__(self):
        self.provider = _get_provider()

    def build_context(
        self,
        persona: Persona,
        history: list[Message],
        memories: list[str],
    ) -> list[dict]:
        memory_text = ""
        if memories:
            memory_lines = "\n".join(f"- {m}" for m in memories)
            memory_text = f"\n\nRelevant memories about the user:\n{memory_lines}"

        system_prompt = (persona.system_prompt or f"You are {persona.name}.") + memory_text

        messages: list[dict] = [{"role": "system", "content": system_prompt}]

        # Sliding window: last N messages, but keep first 2 for context
        max_messages = settings.short_term_memory_size
        if len(history) > max_messages:
            history = history[:2] + history[-(max_messages - 2):]

        for msg in history:
            messages.append({"role": msg.role, "content": msg.content})

        return messages

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        async for token in self.provider.stream_chat(messages):
            yield token

    async def chat(self, messages: list[dict]) -> str:
        return await self.provider.chat(messages)
