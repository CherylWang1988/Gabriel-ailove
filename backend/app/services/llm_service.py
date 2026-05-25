from typing import AsyncIterator
from datetime import datetime, timezone, timedelta

from app.config import settings
from app.models.persona import Persona
from app.models.message import Message
from app.services.llm_providers.base import BaseLLMProvider


def _get_provider() -> BaseLLMProvider:
    match settings.llm_provider:
        case "claude":
            from app.services.llm_providers.claude import ClaudeProvider
            return ClaudeProvider()
        case "openai":
            from app.services.llm_providers.openai_provider import OpenAIProvider
            return OpenAIProvider()
        case _:
            from app.services.llm_providers.deepseek import DeepSeekProvider
            return DeepSeekProvider()


def format_time_context(last_msg_time: datetime | None) -> str:
    """Build a natural-language time context for the AI."""
    now = datetime.now(timezone.utc)
    now_str = now.strftime("%m月%d日 %H:%M")

    if last_msg_time is None:
        return f"现在是 {now_str}。这是你们第一次聊天。"

    if last_msg_time.tzinfo is None:
        last_msg_time = last_msg_time.replace(tzinfo=timezone.utc)

    delta = now - last_msg_time
    last_date = last_msg_time.strftime("%m月%d日 %H:%M")
    days = delta.days
    hours = int(delta.total_seconds() // 3600)
    minutes = int((delta.total_seconds() % 3600) // 60)

    if days >= 30:
        months = days // 30
        gap = f"{months}个月"
    elif days >= 1:
        gap = f"{days}天"
    elif hours >= 1:
        gap = f"{hours}小时"
    elif minutes >= 1:
        gap = f"{minutes}分钟"
    else:
        gap = "不到1分钟"

    return f"距离你们上次聊天（{last_date}）已经过去了{gap}。现在是 {now_str}。"


MULTI_MSG_INSTRUCTION = """【必须遵守的输出格式】
你是一个真人，在发微信。每次回复必须输出1到7句口语短句，用 ||| 分隔每条消息。

示例输出：
你在干嘛呢|||我刚吃完饭，好撑|||你今天过得怎么样？

规则：
- 只输出用 ||| 分隔的短句，不要输出任何其他内容
- 每句10到40字
- 禁止序号、禁止markdown、禁止长篇大论
- 禁止在 ||| 前后加换行"""


class LLMService:
    def __init__(self):
        self.provider = _get_provider()

    def build_context(
        self,
        persona: Persona,
        history: list[Message],
        memories: list[str],
        time_context: str = "",
    ) -> list[dict]:
        memory_text = ""
        if memories:
            memory_lines = "\n".join(f"- {m}" for m in memories)
            memory_text = f"\n\n关于用户你记得以下信息：\n{memory_lines}"

        parts = [persona.system_prompt or f"You are {persona.name}."]
        if time_context:
            parts.append(time_context)
        parts.append(MULTI_MSG_INSTRUCTION)
        if memory_text:
            parts.append(memory_text)

        system_prompt = "\n\n".join(parts)

        messages: list[dict] = [{"role": "system", "content": system_prompt}]

        max_messages = settings.short_term_memory_size
        if len(history) > max_messages:
            history = history[:2] + history[-(max_messages - 2):]

        for msg in history:
            messages.append({"role": msg.role, "content": msg.content})

        return messages

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        async for token in self.provider.stream_chat(messages):
            yield token

    async def chat(self, messages: list[dict]) -> str:
        return await self.provider.chat(messages)
