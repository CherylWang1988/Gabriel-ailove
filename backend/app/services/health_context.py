from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def build_health_context(user_id: str, db: AsyncSession) -> str:
    """Query recent health metrics and return a natural-language summary."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=36)

    result = await db.execute(
        text(
            """SELECT metric_type, value, unit, logged_at
            FROM health_metrics
            WHERE user_id = :uid AND logged_at >= :cutoff
            ORDER BY logged_at DESC"""
        ),
        {"uid": user_id, "cutoff": cutoff},
    )
    rows = result.fetchall()

    if not rows:
        return ""

    # Group by metric_type, take the latest of each
    latest: dict[str, tuple[float, str]] = {}
    for row in rows:
        mtype, value, unit, _logged_at = row
        if mtype not in latest:
            latest[mtype] = (value, unit)

    parts = []
    if "sleep" in latest:
        val, unit = latest["sleep"]
        hours = val / 60
        parts.append(f"昨天睡了{hours:.0f}小时{val % 60:.0f}分钟")
    if "steps" in latest:
        val, _ = latest["steps"]
        parts.append(f"今天走了{int(val)}步")
    if "heart_rate" in latest:
        val, _ = latest["heart_rate"]
        parts.append(f"静息心率{int(val)}bpm")

    if not parts:
        return ""

    return "[健康信息] 用户" + "，".join(parts) + "。"
