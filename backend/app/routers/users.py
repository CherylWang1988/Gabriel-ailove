from fastapi import APIRouter, Depends

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()
    if not user:
        # Auto-create a default user if none exists
        user = User(nickname="夏一鱼", timezone="Asia/Singapore")
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user
