import uuid
from datetime import datetime

from pydantic import BaseModel


class ConversationCreate(BaseModel):
    persona_id: uuid.UUID


class ConversationOut(BaseModel):
    id: uuid.UUID
    persona_id: uuid.UUID
    title: str | None
    message_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationListItem(BaseModel):
    id: uuid.UUID
    persona_id: uuid.UUID
    title: str | None
    last_message: str | None
    message_count: int
    updated_at: datetime

    model_config = {"from_attributes": True}
