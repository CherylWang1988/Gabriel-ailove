import uuid
from datetime import datetime

from pydantic import BaseModel


class PersonaOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    personality_traits: dict | None
    avatar_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
