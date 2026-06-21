import uuid
from datetime import datetime

from pydantic import BaseModel


class MessageCreate(BaseModel):
    content: str
    message_type: str = "text"  # text | image | sticker
    media_url: str | None = None
    save_only: bool = False   # 仅保存消息，不生成AI回复
    reply_only: bool = False  # 仅生成AI回复（消息已保存），不重复存用户消息


class MessageOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID | None
    role: str
    content: str
    message_type: str = "text"
    media_url: str | None = None
    is_proactive: bool = False
    source: str = "app"
    created_at: datetime

    model_config = {"from_attributes": True}
