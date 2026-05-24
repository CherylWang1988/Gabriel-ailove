import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.config import settings
from app.models.memory import MemoryEmbedding
from app.services.embedding_service import EmbeddingService


class MemoryService:
    async def retrieve(self, query: str, db: AsyncSession) -> list[str]:
        """Retrieve top-K relevant memories for a query."""
        try:
            emb_service = EmbeddingService()
            query_embedding = await emb_service.embed(query)
        except Exception:
            # If embedding fails (e.g. no API key), skip memory retrieval
            return []

        embedding_str = f"[{','.join(str(v) for v in query_embedding)}]"
        result = await db.execute(
            text(
                f"""SELECT content, embedding <=> :emb AS distance
                FROM memory_embeddings
                ORDER BY distance
                LIMIT :k"""
            ),
            {"emb": embedding_str, "k": settings.long_term_memory_top_k},
        )
        return [row[0] for row in result.fetchall()]

    async def extract_and_store(
        self,
        user_content: str,
        assistant_content: str,
        conversation_id: uuid.UUID,
        db: AsyncSession,
        llm_service,
    ):
        """Extract memories from the exchange and store embeddings."""
        try:
            extraction_prompt = [
                {
                    "role": "system",
                    "content": (
                        "Extract key facts about the user from this conversation exchange. "
                        "Focus on personal information, preferences, important events, and recurring themes. "
                        "Output each fact on a separate line, in Chinese if the conversation is in Chinese. "
                        "Only output facts, no numbering or bullet points."
                    ),
                },
                {
                    "role": "user",
                    "content": f"User: {user_content}\nAssistant: {assistant_content}",
                },
            ]

            facts_text = await llm_service.chat(extraction_prompt)
            facts = [f.strip() for f in facts_text.strip().split("\n") if f.strip()]
        except Exception:
            return  # Silently skip memory extraction if LLM call fails

        if not facts:
            return

        try:
            emb_service = EmbeddingService()
            embeddings = await emb_service.embed_batch(facts)
        except Exception:
            return  # Silently skip if embedding fails

        for fact, embedding in zip(facts, embeddings):
            memory = MemoryEmbedding(
                conversation_id=conversation_id,
                content=fact,
                embedding=embedding,
                memory_type="episodic",
            )
            db.add(memory)

        await db.commit()
