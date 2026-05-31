import json
import uuid
import asyncio
import random

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db, async_session
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.persona import Persona
from app.schemas.message import MessageCreate, MessageOut
from app.services.llm_service import LLMService, format_time_context
from app.services.memory_service import MemoryService
from app.services.health_context import build_health_context

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

    # Time awareness: find last assistant message time
    last_assistant_time = None
    for m in reversed(history):
        if m.role == "assistant":
            last_assistant_time = m.created_at
            break
    time_context = format_time_context(last_assistant_time)

    # Retrieve relevant long-term memories
    memory_service = MemoryService()
    relevant_memories = await memory_service.retrieve(body.content, db)

    # Build health context
    health_context = ""
    if conv.user_id:
        health_context = await build_health_context(str(conv.user_id), db)

    # Build context
    llm_service = LLMService()
    context_messages = llm_service.build_context(
        persona=persona,
        history=history,
        memories=relevant_memories,
        time_context=time_context,
        health_context=health_context,
    )

    if not stream:
        # Human-like delay before replying (simulate reading/thinking)
        delay = random.uniform(settings.pre_reply_delay_min, settings.pre_reply_delay_max)
        await asyncio.sleep(delay)

        try:
            full_response = ""
            async for token in llm_service.stream_chat(context_messages):
                full_response += token
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        # Parse JSON array response
        import json as json_mod
        raw = full_response.strip()

        # Strip markdown code fence if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        try:
            parts = json_mod.loads(raw)
            if not isinstance(parts, list):
                parts = [raw]
        except (json_mod.JSONDecodeError, ValueError):
            # Fallback: try harder — extract JSON array from mixed text
            import re
            start = raw.find("[")
            end = raw.rfind("]")
            if start >= 0 and end > start:
                try:
                    parts = json_mod.loads(raw[start:end + 1])
                except (json_mod.JSONDecodeError, ValueError):
                    parts = [raw]
            else:
                # Last resort: split by sentence-ending punctuation
                parts = [p.strip() for p in re.split(r'(?<=[。！？.!?\n])', raw) if p.strip() and len(p.strip()) >= 2]
                if not parts:
                    parts = [raw]

        # Filter: remove empty or too-short parts
        parts = [p for p in parts if isinstance(p, str) and len(p.strip()) >= 2]
        if not parts:
            parts = [raw]

        print(f"[json_split] raw_len={len(raw)}, parts={len(parts)}")

        saved_messages = []
        async with async_session() as save_db:
            for i, part in enumerate(parts):
                assistant_msg = Message(
                    conversation_id=uuid.UUID(conversation_id),
                    role="assistant",
                    content=part,
                )
                save_db.add(assistant_msg)
                saved_messages.append({"id": str(assistant_msg.id), "content": part})

                # Update conversation count
                conv_result = await save_db.execute(
                    select(Conversation).where(Conversation.id == conversation_id)
                )
                save_conv = conv_result.scalar_one()
                save_conv.message_count += 1

            await save_db.commit()

            # Extract memories from the full exchange
            await memory_service.extract_and_store(
                user_content=body.content,
                assistant_content=full_response,
                conversation_id=uuid.UUID(conversation_id),
                db=save_db,
                llm_service=llm_service,
            )

            return {"messages": saved_messages}

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
