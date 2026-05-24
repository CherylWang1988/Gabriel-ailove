import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.database import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.persona import Persona
from app.schemas.conversation import ConversationCreate, ConversationOut, ConversationListItem

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationListItem])
async def list_conversations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Conversation).order_by(desc(Conversation.updated_at))
    )
    conversations = result.scalars().all()

    items = []
    for conv in conversations:
        last_msg_result = await db.execute(
            select(Message.content)
            .where(Message.conversation_id == conv.id)
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        last_message = last_msg_result.scalar_one_or_none()
        items.append(ConversationListItem(
            id=conv.id,
            persona_id=conv.persona_id,
            title=conv.title,
            last_message=last_message,
            message_count=conv.message_count,
            updated_at=conv.updated_at,
        ))
    return items


@router.post("", response_model=ConversationOut, status_code=201)
async def create_conversation(body: ConversationCreate, db: AsyncSession = Depends(get_db)):
    persona_result = await db.execute(select(Persona).where(Persona.id == body.persona_id))
    if not persona_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Persona not found")

    conv = Conversation(persona_id=body.persona_id)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return conv


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conv)
    await db.commit()
