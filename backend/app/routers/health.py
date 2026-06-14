import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.health import HealthMetric
from app.schemas.health import HealthSyncPayload
from app.services.user_service import get_or_create_default_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/health", tags=["health"])


@router.post("/sync", status_code=204)
async def sync_health(body: HealthSyncPayload, db: AsyncSession = Depends(get_db)):
    user = await get_or_create_default_user(db)

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
    logger.debug("Health sync: %d metrics stored for user %s", len(body.metrics), user.id)
