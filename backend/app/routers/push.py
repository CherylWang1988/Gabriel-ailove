import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.push_token import PushToken
from app.schemas.push import PushTokenRegister
from app.services.user_service import get_or_create_default_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/push", tags=["push"])


@router.post("/register", status_code=204)
async def register_push(body: PushTokenRegister, db: AsyncSession = Depends(get_db)):
    user = await get_or_create_default_user(db)

    existing = await db.execute(select(PushToken).where(PushToken.token == body.token))
    if existing.scalar_one_or_none():
        logger.debug("Push token already registered: %s...", body.token[:10])
        return

    push_token = PushToken(
        user_id=user.id,
        token=body.token,
        platform=body.platform,
    )
    db.add(push_token)
    await db.commit()
    logger.info("Push token registered: %s... (platform=%s)", body.token[:10], body.platform)
