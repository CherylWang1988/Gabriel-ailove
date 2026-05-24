import json
import uuid
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db, async_session
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.persona import Persona
from app.schemas.message import MessageCreate, MessageOut
from app.services.llm_service import LLMService
from app.services.memory_service import MemoryService

router = APIRouter(prefix="/api/conversations", tags=["messages"])


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conversation_id: str,
    offset: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    db: AsyncSession = Depends(get_db),
):
    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save user message
    user_msg = Message(conversation_id=uuid.UUID(conversation_id), role="user", content=body.content)
    conv.message_count += 1

    # Auto-generate title from first user message
    if conv.title is None:
        conv.title = body.content[:50] + ("..." if len(body.content) > 50 else "")

    db.add(user_msg)
    await db.commit()

    # Load persona
    persona_result = await db.execute(select(Persona).where(Persona.id == conv.persona_id))
    persona = persona_result.scalar_one_or_none()

    # Load conversation history (short-term memory)
    history_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    history = history_result.scalars().all()

    # Retrieve relevant long-term memories
    memory_service = MemoryService()
    relevant_memories = await memory_service.retrieve(body.content, db)

    # Build context
    llm_service = LLMService()
    context_messages = llm_service.build_context(
        persona=persona,
        history=history,
        memories=relevant_memories,
    )

    async def event_stream():
        full_response = ""
        try:
            async for token in llm_service.stream_chat(context_messages):
                full_response += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            # Save assistant message
            async with async_session() as save_db:
                assistant_msg = Message(
                    conversation_id=uuid.UUID(conversation_id),
                    role="assistant",
                    content=full_response,
                )
                save_db.add(assistant_msg)

                # Update conversation
                conv_result = await save_db.execute(
                    select(Conversation).where(Conversation.id == conversation_id)
                )
                save_conv = conv_result.scalar_one()
                save_conv.message_count += 1

                await save_db.commit()

                # Extract memories async
                await memory_service.extract_and_store(
                    user_content=body.content,
                    assistant_content=full_response,
                    conversation_id=uuid.UUID(conversation_id),
                    db=save_db,
                    llm_service=llm_service,
                )

                yield f"data: {json.dumps({'type': 'done', 'message_id': str(assistant_msg.id)})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
