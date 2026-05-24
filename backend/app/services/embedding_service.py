from openai import AsyncOpenAI

from app.config import settings


class EmbeddingService:
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.embedding_api_key or settings.openai_api_key,
            base_url=settings.embedding_base_url or settings.openai_base_url or None,
        )
        self.model = settings.embedding_model

    async def embed(self, text: str) -> list[float]:
        response = await self.client.embeddings.create(model=self.model, input=text)
        return response.data[0].embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        response = await self.client.embeddings.create(model=self.model, input=texts)
        return [item.embedding for item in response.data]
