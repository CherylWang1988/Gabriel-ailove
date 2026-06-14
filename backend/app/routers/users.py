import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.user import UserOut
from app.services.user_service import get_or_create_default_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(db: AsyncSession = Depends(get_db)):
    user = await get_or_create_default_user(db)
    await db.commit()
    await db.refresh(user)
    return user
