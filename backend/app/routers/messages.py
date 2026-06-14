import json
import uuid
import asyncio
import random
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.persona import Persona
from app.schemas.message import MessageCreate, MessageOut
from app.services.llm_service import LLMService, format_time_context
from app.services.memory_service import MemoryService
from app.services.health_context import build_health_context
from app.services.response_parser import parse_llm_response

logger = logging.getLogger(__name__)
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
    stream: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """Send a message and get AI reply. All DB writes happen in one transaction."""
    conv_id = uuid.UUID(conversation_id)

    conv_result = await db.execute(select(Conversation).where(Conversation.id == conv_id))
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # ── Save user message ──
    user_msg = Message(conversation_id=conv_id, role="user", content=body.content)
    conv.message_count += 1

    if conv.title is None:
        conv.title = body.content[:50] + ("..." if len(body.content) > 50 else "")

    db.add(user_msg)
    await db.commit()  # commit so LLM context includes the user message

    # ── Load context ──
    persona_result = await db.execute(select(Persona).where(Persona.id == conv.persona_id))
    persona = persona_result.scalar_one_or_none()

    history_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at)
    )
    history = history_result.scalars().all()

    last_assistant_time = None
    for m in reversed(history):
        if m.role == "assistant":
            last_assistant_time = m.created_at
            break
    time_context = format_time_context(last_assistant_time)

    memory_service = MemoryService()
    relevant_memories = await memory_service.retrieve(body.content, db)

    health_context = ""
    if conv.user_id:
        health_context = await build_health_context(str(conv.user_id), db)

    llm_service = LLMService()
    context_messages = llm_service.build_context(
        persona=persona,
        history=history,
        memories=relevant_memories,
        time_context=time_context,
        health_context=health_context,
    )

    # ── Non-streaming path ──
    if not stream:
        delay = random.uniform(settings.pre_reply_delay_min, settings.pre_reply_delay_max)
        await asyncio.sleep(delay)

        try:
            full_response = ""
            async for token in llm_service.stream_chat(context_messages):
                full_response += token
        except Exception as e:
            logger.error("LLM call failed for conversation %s: %s", conversation_id, e)
            raise HTTPException(status_code=500, detail="LLM service error")

        parts = parse_llm_response(full_response.strip())
        logger.info(
            "Parsed %d message parts (raw_len=%d) for conversation %s",
            len(parts), len(full_response), conversation_id,
        )

        saved_messages = []
        for part in parts:
            assistant_msg = Message(
                conversation_id=conv_id,
                role="assistant",
                content=part,
            )
            db.add(assistant_msg)
            conv.message_count += 1
            saved_messages.append({"id": str(assistant_msg.id), "content": part})

        await db.commit()

        # Extract memories (uses the same db session)
        await memory_service.extract_and_store(
            user_content=body.content,
            assistant_content=full_response,
            conversation_id=conv_id,
            db=db,
            llm_service=llm_service,
        )

        return {"messages": saved_messages}

    # ── Streaming path ──
    async def event_stream():
        full_response = ""
        try:
            async for token in llm_service.stream_chat(context_messages):
                full_response += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            # Save assistant message (streaming uses a fresh session for isolation)
            from app.database import async_session
            async with async_session() as save_db:
                assistant_msg = Message(
                    conversation_id=conv_id,
                    role="assistant",
                    content=full_response,
                )
                save_db.add(assistant_msg)

                conv_result = await save_db.execute(
                    select(Conversation).where(Conversation.id == conv_id)
                )
                save_conv = conv_result.scalar_one()
                save_conv.message_count += 1

                await save_db.commit()

                await memory_service.extract_and_store(
                    user_content=body.content,
                    assistant_content=full_response,
                    conversation_id=conv_id,
                    db=save_db,
                    llm_service=llm_service,
                )

                yield f"data: {json.dumps({'type': 'done', 'message_id': str(assistant_msg.id)})}\n\n"

        except Exception as e:
            logger.error("Streaming error for conversation %s: %s", conversation_id, e)
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
