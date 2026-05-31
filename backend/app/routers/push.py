from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.push_token import PushToken
from app.schemas.push import PushTokenRegister

router = APIRouter(prefix="/api/push", tags=["push"])


@router.post("/register", status_code=204)
async def register_push(body: PushTokenRegister, db: AsyncSession = Depends(get_db)):
    # Find default user
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()
    if not user:
        user = User(nickname="夏一鱼", timezone="Asia/Singapore")
        db.add(user)
        await db.flush()

    # Check if token already exists
    existing = await db.execute(select(PushToken).where(PushToken.token == body.token))
    if existing.scalar_one_or_none():
        return

    push_token = PushToken(
        user_id=user.id,
        token=body.token,
        platform=body.platform,
    )
    db.add(push_token)
    await db.commit()
