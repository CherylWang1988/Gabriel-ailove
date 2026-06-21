"""
WeChat Message Service — 微信消息处理管线
==========================================
处理从微信收到的消息：
  - 正常聊天：走完整 LLM 管线（persona + history + memory + health）
  - 命令模式：以 /cmd 或 /code 开头，调用 Claude CLI 执行代码修改
"""

import asyncio
import json as json_mod
import random
import re
import uuid
from typing import Optional, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.persona import Persona
from app.models.user import User
from app.services.llm_service import LLMService, format_time_context
from app.services.memory_service import MemoryService
from app.services.health_context import build_health_context

# ─── 常量 ───────────────────────────────────────────────────────────────────

CMD_PREFIXES = ("/cmd ", "/code ")
CMD_TIMEOUT_SECONDS = 120
CMD_MAX_OUTPUT_CHARS = 1800  # 微信单条消息限制 ~2048，留余量


# ─── JSON 数组解析（复用 messages.py 逻辑）─────────────────────────────────

def parse_llm_json_array(raw: str) -> List[str]:
    """将 LLM 返回的 JSON 数组字符串解析为消息片段列表"""
    raw = raw.strip()

    # Strip markdown code fence if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        parts = json_mod.loads(raw)
        if not isinstance(parts, list):
            parts = [raw]
    except (json_mod.JSONDecodeError, ValueError):
        # Fallback: extract JSON array from mixed text
        start = raw.find("[")
        end = raw.rfind("]")
        if start >= 0 and end > start:
            try:
                parts = json_mod.loads(raw[start:end + 1])
            except (json_mod.JSONDecodeError, ValueError):
                parts = [raw]
        else:
            # Last resort: split by sentence-ending punctuation
            parts = [p.strip() for p in re.split(r'(?<=[。！？.!?\n])', raw) if p.strip() and len(p.strip()) >= 2]
            if not parts:
                parts = [raw]

    # Filter: remove empty or too-short parts
    parts = [p for p in parts if isinstance(p, str) and len(p.strip()) >= 2]
    if not parts:
        parts = [raw]

    return parts


# ─── 命令执行 ────────────────────────────────────────────────────────────────

async def run_claude_command(instruction: str) -> str:
    """在子进程中调用 claude CLI 执行代码修改指令，返回结果文本"""
    try:
        proc = await asyncio.create_subprocess_exec(
            "claude", "-p", instruction,
            "--output-format", "text",
            "--max-turns", "10",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=CMD_TIMEOUT_SECONDS,
        )
        output = stdout.decode("utf-8", errors="replace").strip()
        err_output = stderr.decode("utf-8", errors="replace").strip()

        if err_output and not output:
            output = f"[stderr] {err_output}"
        elif err_output:
            output += f"\n[stderr] {err_output}"

        if not output:
            output = "(命令执行完成，无输出)"

        # Truncate to fit WeChat message limits
        if len(output) > CMD_MAX_OUTPUT_CHARS:
            output = output[:CMD_MAX_OUTPUT_CHARS - 50] + "\n\n... (输出过长已截断)"

        return output

    except asyncio.TimeoutError:
        return f"⏰ 命令执行超时（{CMD_TIMEOUT_SECONDS}秒）。请尝试拆分任务或简化指令。"
    except FileNotFoundError:
        return "❌ Claude CLI 未找到。请确认 claude 已安装在 PATH 中。"
    except Exception as e:
        return f"❌ 命令执行异常: {type(e).__name__}: {e}"


# ─── WeChat 消息处理服务 ────────────────────────────────────────────────────

class WeChatMessageService:
    """
    微信消息处理中枢。
    作为 MessageHandler.on_message 的回调，处理每条微信消息。
    """

    def __init__(self):
        self._user_conversation_cache: dict[str, uuid.UUID] = {}
        self._persona_id: Optional[uuid.UUID] = None

    async def _get_gabriel_persona(self, db: AsyncSession) -> Persona:
        """获取或缓存 Gabriel persona"""
        if self._persona_id:
            result = await db.execute(select(Persona).where(Persona.id == self._persona_id))
            persona = result.scalar_one_or_none()
            if persona:
                return persona

        # Find by name "gabriel" (case-insensitive)
        result = await db.execute(
            select(Persona).where(Persona.name.ilike("gabriel"))
        )
        persona = result.scalar_one_or_none()
        if persona:
            self._persona_id = persona.id
            return persona

        # Fallback: first companion persona
        result = await db.execute(
            select(Persona).where(Persona.persona_type == "companion").limit(1)
        )
        persona = result.scalar_one_or_none()
        if persona:
            self._persona_id = persona.id
            return persona

        raise RuntimeError("No persona found for WeChat conversations")

    async def _get_or_create_wechat_user(self, wxid: str, db: AsyncSession) -> User:
        """根据微信 ID 查找或创建 DB User"""
        # We use nickname to store the wxid for lookup (user model is minimal)
        result = await db.execute(
            select(User).where(User.nickname == f"wx:{wxid}")
        )
        user = result.scalar_one_or_none()
        if user:
            return user

        user = User(nickname=f"wx:{wxid}", timezone="Asia/Shanghai")
        db.add(user)
        await db.flush()
        return user

    async def _get_or_create_conversation(
        self, wxid: str, db: AsyncSession
    ) -> Conversation:
        """根据微信用户 ID 查找或创建 source='wechat' 的对话"""
        # Check cache
        if wxid in self._user_conversation_cache:
            conv_id = self._user_conversation_cache[wxid]
            result = await db.execute(
                select(Conversation).where(Conversation.id == conv_id)
            )
            conv = result.scalar_one_or_none()
            if conv:
                return conv
            # Cache miss — conversation deleted, clear cache
            del self._user_conversation_cache[wxid]

        # Look up by user and source
        user = await self._get_or_create_wechat_user(wxid, db)
        persona = await self._get_gabriel_persona(db)

        result = await db.execute(
            select(Conversation).where(
                Conversation.user_id == user.id,
                Conversation.source == "wechat",
            ).limit(1)
        )
        conv = result.scalar_one_or_none()
        if conv:
            self._user_conversation_cache[wxid] = conv.id
            return conv

        # Create new WeChat conversation
        conv = Conversation(
            user_id=user.id,
            persona_id=persona.id,
            source="wechat",
            title=f"微信聊天 - {wxid}",
        )
        db.add(conv)
        await db.flush()
        self._user_conversation_cache[wxid] = conv.id
        return conv

    async def _chat_pipeline(self, wxid: str, content: str) -> List[str]:
        """
        完整聊天管线：保存消息 → 加载上下文 → 调用 LLM → 保存回复 → 提取记忆
        返回回复文本片段列表（用于逐条发送微信消息）
        """
        persona = None
        history = []
        relevant_memories = []
        time_context = ""
        health_context = ""
        user_msg_id = None
        conversation_id = None

        # ── Phase 1: 保存用户消息 + 加载上下文（在同一个 session 中） ──
        async with async_session() as db:
            try:
                conv = await self._get_or_create_conversation(wxid, db)
                conversation_id = conv.id

                # Save user message
                user_msg = Message(
                    conversation_id=conversation_id,
                    role="user",
                    content=content,
                    source="wechat",
                )
                conv.message_count += 1
                if conv.title is None or conv.title.startswith("微信聊天 -"):
                    conv.title = content[:50] + ("..." if len(content) > 50 else "")

                db.add(user_msg)
                await db.flush()
                user_msg_id = user_msg.id

                # Load persona
                persona = await self._get_gabriel_persona(db)

                # Load conversation history
                history_result = await db.execute(
                    select(Message)
                    .where(Message.conversation_id == conversation_id)
                    .order_by(Message.created_at)
                )
                history = history_result.scalars().all()

                # Time context
                last_assistant_time = None
                for m in reversed(history):
                    if m.role == "assistant":
                        last_assistant_time = m.created_at
                        break
                time_context = format_time_context(last_assistant_time)

                # Long-term memories
                memory_service = MemoryService()
                relevant_memories = await memory_service.retrieve(content, db)

                # Health context
                if conv.user_id:
                    health_context = await build_health_context(str(conv.user_id), db)

                await db.commit()
            except Exception:
                await db.rollback()
                raise

        # ── Phase 2: 调用 LLM（不持有 DB session） ──
        llm_service = LLMService()
        context_messages = llm_service.build_context(
            persona=persona,
            history=history,
            memories=relevant_memories,
            time_context=time_context,
            health_context=health_context,
        )

        # Human-like delay
        delay = random.uniform(settings.pre_reply_delay_min, settings.pre_reply_delay_max)
        await asyncio.sleep(delay)

        try:
            full_response = ""
            async for token in llm_service.stream_chat(context_messages):
                full_response += token
        except Exception as e:
            print(f"[wechat] LLM call failed: {e}")
            return [f"抱歉，我现在有点卡住了… 晚点再试试？ ({type(e).__name__})"]

        # Parse JSON array
        parts = parse_llm_json_array(full_response)
        print(f"[wechat] LLM response: {len(parts)} parts, raw_len={len(full_response)}")

        # ── Phase 3: 保存回复 + 提取记忆 ──
        async with async_session() as db:
            try:
                for part in parts:
                    assistant_msg = Message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=part,
                        source="wechat",
                    )
                    db.add(assistant_msg)
                    conv_result = await db.execute(
                        select(Conversation).where(Conversation.id == conversation_id)
                    )
                    save_conv = conv_result.scalar_one()
                    save_conv.message_count += 1

                await db.commit()

                # Extract memories
                memory_service = MemoryService()
                await memory_service.extract_and_store(
                    user_content=content,
                    assistant_content=full_response,
                    conversation_id=conversation_id,
                    db=db,
                    llm_service=llm_service,
                )
            except Exception as e:
                await db.rollback()
                print(f"[wechat] Failed to save assistant messages: {e}")

        return parts

    async def _command_pipeline(self, wxid: str, instruction: str) -> str:
        """
        命令管线：执行代码修改指令，返回结果。
        同时将命令和结果保存到 DB（使用特殊的 command conversation）。
        """
        print(f"[wechat] Command from {wxid}: {instruction}")

        # Save to DB as a special interaction
        async with async_session() as db:
            try:
                conv = await self._get_or_create_conversation(wxid, db)
                user_msg = Message(
                    conversation_id=conv.id,
                    role="user",
                    content=f"/cmd {instruction}",
                    source="wechat",
                )
                conv.message_count += 1
                db.add(user_msg)
                await db.commit()
            except Exception:
                await db.rollback()

        # Execute the command
        result = await run_claude_command(instruction)

        # Save result
        async with async_session() as db:
            try:
                conv = await self._get_or_create_conversation(wxid, db)
                assistant_msg = Message(
                    conversation_id=conv.id,
                    role="assistant",
                    content=f"[命令结果]\n{result}",
                    source="wechat",
                )
                conv.message_count += 1
                db.add(assistant_msg)
                await db.commit()
            except Exception:
                await db.rollback()

        return result

    async def process(self, wxid: str, content: str) -> List[str]:
        """
        处理一条微信消息，返回回复文本列表。

        这是绑定到 MessageHandler.on_message 的回调函数。

        返回:
            list[str]: 回复文本片段。正常聊天返回多条（模拟微信分段发），命令返回单条。
        """
        stripped = content.strip()

        # ── 命令检测 ──
        for prefix in CMD_PREFIXES:
            if stripped.startswith(prefix):
                instruction = stripped[len(prefix):].strip()
                if not instruction:
                    return ["请在想执行的指令前加上 /cmd，例如：/cmd 修复登录 bug"]
                result = await self._command_pipeline(wxid, instruction)
                # Split long command results
                if len(result) <= 1800:
                    return [result]
                # Split into chunks at sentence boundaries
                chunks = []
                remaining = result
                while len(remaining) > 1800:
                    split_at = remaining.rfind("\n", 0, 1800)
                    if split_at < 1600:
                        split_at = remaining.rfind("。", 0, 1800)
                    if split_at < 1600:
                        split_at = remaining.rfind(".", 0, 1800)
                    if split_at < 1600:
                        split_at = 1799
                    chunks.append(remaining[:split_at + 1])
                    remaining = remaining[split_at + 1:]
                if remaining.strip():
                    chunks.append(remaining)
                return chunks

        # ── 正常聊天 ──
        try:
            parts = await self._chat_pipeline(wxid, content)
            return parts
        except Exception as e:
            print(f"[wechat] Chat pipeline error: {e}")
            import traceback
            traceback.print_exc()
            return [f"出了点问题… 晚点再找我聊吧 🥲"]
