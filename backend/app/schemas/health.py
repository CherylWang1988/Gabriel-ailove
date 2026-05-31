from datetime import datetime

from pydantic import BaseModel


class HealthMetricItem(BaseModel):
    metric_type: str  # sleep | steps | heart_rate
    value: float
    unit: str  # minutes | steps | bpm
    logged_at: datetime


class HealthSyncPayload(BaseModel):
    metrics: list[HealthMetricItem]
