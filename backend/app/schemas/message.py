import uuid
from datetime import datetime

from pydantic import BaseModel


class MessageCreate(BaseModel):
    content: str


class MessageOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID | None
    role: str
    content: str
    is_proactive: bool = False
    source: str = "app"
    created_at: datetime

    model_config = {"from_attributes": True}"
