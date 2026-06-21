from abc import ABC, abstractmethod
from typing import AsyncIterator


class BaseLLMProvider(ABC):
    @abstractmethod
    async def stream_chat(self, messages: list[dict], model: str) -> AsyncIterator[str]:
        ...

    @abstractmethod
    async def chat(self, messages: list[dict], model: str) -> str:
        ...
