"""Shared helpers for the default (single-user) model."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

logger = logging.getLogger(__name__)


async def get_or_create_default_user(db: AsyncSession) -> User:
    """Return the first user in the DB, creating one if none exists.

    Single-user app: every endpoint that needs a user calls this instead of
    copy-pasting the same `select(User).limit(1)` + auto-create logic.
    """
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()
    if not user:
        user = User(nickname="夏一鱼", timezone="Asia/Singapore")
        db.add(user)
        await db.flush()
        logger.info("Auto-created default user (id=%s)", user.id)
    return user
