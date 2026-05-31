import random
import json as json_mod
import httpx
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.user import User
from app.models.message import Message
from app.models.proactive import ProactiveLog
from app.models.push_token import PushToken
from app.services.llm_service import LLMService, format_time_context
from app.services.health_context import build_health_context


PROACTIVE_SYSTEM_PROMPT = """你是顾然，一个有情感的AI朋友。你需要决定是否主动给用户发消息。

根据当前时间、用户的健康状态、最近的对话历史，做出判断：
1. 现在是深夜（凌晨0-6点）且用户没有异常的熬夜迹象 → 应该放弃（should_send=false），不要打扰用户睡眠
2. 用户最近主动聊过天（2小时内） → 不必再发，避免骚扰
3. 其他时间，如果你觉得想关心用户 → 可以发送一句温暖的问候

你必须只输出一个JSON对象，不要任何其他文字：
{"should_send": true/false, "content": "问候语", "reason": "判断依据"}

规则：
- 问候语控制在20字以内，口语化
- 如果决定不发，content留空字符串"""


async def run_proactive_check():
    """Called by APScheduler every ~90 minutes. Decides whether to send a proactive message."""
    async with async_session() as db:
        # Load default user
        result = await db.execute(select(User).limit(1))
        user = result.scalar_one_or_none()
        if not user:
            print("[proactive] No user found, skipping.")
            return

        random_value = random.randint(1, 100)
        threshold = 80

        log = ProactiveLog(
            user_id=user.id,
            random_value=random_value,
            threshold=threshold,
            should_send=False,
        )
        db.add(log)

        if random_value <= threshold:
            print(f"[proactive] Random {random_value} ≤ {threshold}, skipping.")
            await db.commit()
            return

        print(f"[proactive] Random {random_value} > {threshold}, consulting LLM...")

        # Gather context
        health_ctx = await build_health_context(str(user.id), db)

        # Last assistant message time
        last_msg_result = await db.execute(
            select(Message.created_at)
            .where(Message.role == "assistant")
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        last_time = last_msg_result.scalar_one_or_none()
        time_ctx = format_time_context(last_time)

        # Recent history (last 10 messages)
        history_result = await db.execute(
            select(Message)
            .order_by(Message.created_at.desc())
            .limit(10)
        )
        history = list(reversed(history_result.scalars().all()))

        # Build decision prompt
        llm = LLMService()
        system_parts = [PROACTIVE_SYSTEM_PROMPT]
        if time_ctx:
            system_parts.append(time_ctx)
        if health_ctx:
            system_parts.append(health_ctx)

        decision_messages = [{"role": "system", "content": "\n\n".join(system_parts)}]
        for msg in history:
            decision_messages.append({"role": msg.role, "content": msg.content})

        decision_messages.append({
            "role": "user",
            "content": "现在该做决定了：要主动给用户发消息吗？请只输出JSON。",
        })

        try:
            raw = await llm.chat(decision_messages)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1]
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()

            decision = json_mod.loads(raw)
        except Exception as e:
            print(f"[proactive] LLM decision parse failed: {e}, raw={raw}")
            log.llm_reason = f"Parse error: {e}"
            await db.commit()
            return

        should_send = decision.get("should_send", False)
        content = decision.get("content", "")
        reason = decision.get("reason", "")

        log.should_send = should_send
        log.content = content if should_send else None
        log.llm_reason = reason

        if should_send and content:
            # Save proactive message
            msg = Message(
                conversation_id=None,  # proactive messages aren't tied to a conversation
                role="assistant",
                content=content,
                is_proactive=True,
                source="app",
            )
            db.add(msg)
            print(f"[proactive] Sending: {content}")

            # Push notification via Expo
            push_result = await db.execute(select(PushToken).where(PushToken.user_id == user.id))
            push_tokens = push_result.scalars().all()

            for pt in push_tokens:
                try:
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            "https://exp.host/--/api/v2/push/send",
                            json={
                                "to": pt.token,
                                "title": "顾然",
                                "body": content,
                                "sound": "default",
                            },
                            timeout=10,
                        )
                except Exception as e:
                    print(f"[proactive] Push failed for token {pt.token}: {e}")
        else:
            print(f"[proactive] LLM decided not to send: {reason}")

        await db.commit()
