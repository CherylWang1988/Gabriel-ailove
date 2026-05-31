import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.health import HealthMetric
from app.schemas.health import HealthSyncPayload

router = APIRouter(prefix="/api/health", tags=["health"])


@router.post("/sync", status_code=204)
async def sync_health(body: HealthSyncPayload, db: AsyncSession = Depends(get_db)):
    # Find default user
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()
    if not user:
        user = User(nickname="夏一鱼", timezone="Asia/Singapore")
        db.add(user)
        await db.flush()

    for item in body.metrics:
        metric = HealthMetric(
            user_id=user.id,
            metric_type=item.metric_type,
            value=item.value,
            unit=item.unit,
            logged_at=item.logged_at,
        )
        db.add(metric)

    await db.commit()
