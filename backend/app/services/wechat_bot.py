"""
WeChat Bot — 原生 iLink 协议实现
==================================
基于 @tencent-weixin/openclaw-weixin v2.4.4 源码逆向出的 iLink Bot 协议。
无需 OpenClaw，直接与 https://ilinkai.weixin.qq.com 通信。

流程:
  1. 获取二维码 → 用户微信扫码 → 获取 bot_token
  2. 长轮询 getUpdates 接收消息
  3. 调用 sendMessage 回复

依赖: httpx, pycryptodome (AES-128-ECB)
"""

import asyncio
import base64
import hashlib
import json
import os
import random
import struct
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Callable, Awaitable

import httpx

# ─── 常量 ───────────────────────────────────────────────────────────────────

ILINK_BASE_URL = "https://ilinkai.weixin.qq.com"
ILINK_APP_ID = "bot"
ILINK_APP_CLIENT_VERSION = 0x00020404  # 2.4.4 encoded as 0x00MMNNPP
BOT_TYPE = "3"
QR_LONG_POLL_TIMEOUT = 35_000
GET_UPDATES_TIMEOUT = 35_000
CONTEXT_TOKEN_FILE = "wechat_context_tokens.json"
SYNC_BUF_FILE = "wechat_sync_buf.json"

# ─── 数据结构 ──────────────────────────────────────────────────────────────

@dataclass
class WeChatAccount:
    """持久化的微信账号凭证"""
    bot_token: str
    bot_id: str         # ilink_bot_id, e.g. "xxxx@im.bot"
    base_url: str       # e.g. "https://ilinkai.weixin.qq.com"
    user_id: str        # 扫码者的微信 ID
    nickname: str = ""
    created_at: str = ""

@dataclass
class InboundMessage:
    """从微信收到的消息"""
    msg_id: str
    from_user: str       # 发送者 wxid@im.wechat
    content: str
    timestamp_ms: int
    context_token: str   # 回复时必须回传
    msg_type: int = 1    # 1=text, 2=image, 3=voice, ...

# ─── 持久化存储 ───────────────────────────────────────────────────────────

class WeChatStore:
    """管理账号凭证、sync_buf、context_token 的本地 JSON 文件存储"""

    def __init__(self, data_dir: str = ""):
        if not data_dir:
            data_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "wechat")
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._account_file = self.data_dir / "account.json"
        self._sync_buf_file = self.data_dir / SYNC_BUF_FILE
        self._tokens_file = self.data_dir / CONTEXT_TOKEN_FILE

    # ── 账号凭证 ──

    def save_account(self, account: WeChatAccount):
        with open(self._account_file, "w") as f:
            f.write(json.dumps({
                "bot_token": account.bot_token,
                "bot_id": account.bot_id,
                "base_url": account.base_url,
                "user_id": account.user_id,
                "nickname": account.nickname,
                "created_at": account.created_at or datetime.now().isoformat(),
            }, indent=2, ensure_ascii=False))

    def load_account(self) -> Optional[WeChatAccount]:
        if not self._account_file.exists():
            return None
        try:
            d = json.loads(self._account_file.read_text())
            return WeChatAccount(
                bot_token=d["bot_token"],
                bot_id=d["bot_id"],
                base_url=d.get("base_url", ILINK_BASE_URL),
                user_id=d.get("user_id", ""),
                nickname=d.get("nickname", ""),
                created_at=d.get("created_at", ""),
            )
        except (json.JSONDecodeError, KeyError):
            return None

    def has_account(self) -> bool:
        return self._account_file.exists()

    # ── Sync Buf（长轮询上下文） ──

    def save_sync_buf(self, buf: str):
        self._sync_buf_file.write_text(json.dumps({"buf": buf}))

    def load_sync_buf(self) -> str:
        if not self._sync_buf_file.exists():
            return ""
        try:
            return json.loads(self._sync_buf_file.read_text()).get("buf", "")
        except (json.JSONDecodeError, KeyError):
            return ""

    # ── Context Token ──

    def save_context_token(self, user_id: str, token: str):
        tokens = {}
        if self._tokens_file.exists():
            try:
                tokens = json.loads(self._tokens_file.read_text())
            except json.JSONDecodeError:
                pass
        tokens[user_id] = token
        self._tokens_file.write_text(json.dumps(tokens, indent=2))

    def get_context_token(self, user_id: str) -> Optional[str]:
        if not self._tokens_file.exists():
            return None
        try:
            return json.loads(self._tokens_file.read_text()).get(user_id)
        except json.JSONDecodeError:
            return None

# ─── iLink 协议客户端 ──────────────────────────────────────────────────────

class ILinkClient:
    """
    与微信 iLink 服务通信的低级客户端。
    处理请求签名、header、HTTP 通信。
    """

    def __init__(self, base_url: str = ILINK_BASE_URL, token: str = ""):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _build_headers(self, with_auth: bool = True) -> dict:
        headers = {
            "Content-Type": "application/json",
            "iLink-App-Id": ILINK_APP_ID,
            "iLink-App-ClientVersion": str(ILINK_APP_CLIENT_VERSION),
            "X-WECHAT-UIN": self._random_uin(),
        }
        if with_auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
            headers["AuthorizationType"] = "ilink_bot_token"
        return headers

    @staticmethod
    def _random_uin() -> str:
        """Random uint32 → decimal string → base64"""
        uin = random.randint(0, 0xFFFFFFFF)
        return base64.b64encode(str(uin).encode()).decode()

    async def _post(self, endpoint: str, body: dict, timeout: int = 15_000,
                    with_auth: bool = True) -> dict:
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout / 1000 + 5)) as client:
            resp = await client.post(url, json=body, headers=self._build_headers(with_auth))
            resp.raise_for_status()
            return resp.json()

    async def _get(self, endpoint: str, timeout: int = 15_000,
                   with_auth: bool = False) -> dict:
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout / 1000 + 5)) as client:
            resp = await client.get(url, headers=self._build_headers(with_auth))
            resp.raise_for_status()
            return resp.json()

    # ── 二维码登录 ──

    async def get_qrcode(self) -> dict:
        """获取登录二维码"""
        return await self._post(
            f"ilink/bot/get_bot_qrcode?bot_type={BOT_TYPE}",
            body={"local_token_list": []},
            with_auth=False,
        )

    async def poll_qrcode_status(self, qrcode: str, verify_code: str = "") -> dict:
        """长轮询二维码扫码状态"""
        endpoint = f"ilink/bot/get_qrcode_status?qrcode={httpx.escape(qrcode)}"
        if verify_code:
            endpoint += f"&verify_code={httpx.escape(verify_code)}"
        return await self._get(endpoint, timeout=QR_LONG_POLL_TIMEOUT)

    # ── 消息 ──

    async def get_updates(self, sync_buf: str = "", abort_signal=None) -> dict:
        """长轮询拉取新消息"""
        body = {
            "get_updates_buf": sync_buf,
            "base_info": {
                "channel_version": "2.4.4",
                "bot_agent": "Gabriel/1.0",
            },
        }
        try:
            return await self._post(
                "ilink/bot/getupdates",
                body=body,
                timeout=GET_UPDATES_TIMEOUT,
            )
        except httpx.TimeoutException:
            # 长轮询超时是正常的，返回空
            return {"ret": 0, "msgs": [], "get_updates_buf": sync_buf}
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 408:
                return {"ret": 0, "msgs": [], "get_updates_buf": sync_buf}
            raise

    async def send_message(self, to_user: str, text: str,
                           context_token: str = "", run_id: str = "") -> None:
        """发送文本消息"""
        msg = {
            "from_user_id": "",
            "to_user_id": to_user,
            "client_id": str(uuid.uuid4()),
            "message_type": 2,  # BOT
            "message_state": 2,  # FINISH
            "item_list": [
                {"type": 1, "text_item": {"text": text}}
            ],
        }
        if context_token:
            msg["context_token"] = context_token
        if run_id:
            msg["run_id"] = run_id
        body = {"msg": msg, "base_info": {}}
        await self._post("ilink/bot/sendmessage", body=body)

    async def send_typing(self, user_id: str, typing_ticket: str,
                          status: int = 1) -> None:
        """发送正在输入状态"""
        body = {
            "ilink_user_id": user_id,
            "typing_ticket": typing_ticket,
            "status": status,
        }
        await self._post("ilink/bot/sendtyping", body=body)

    async def get_config(self, user_id: str) -> dict:
        """获取用户配置（含 typing_ticket）"""
        body = {"ilink_user_id": user_id, "base_info": {}}
        return await self._post("ilink/bot/getconfig", body=body)

    async def notify_start(self) -> dict:
        """通知服务端 bot 上线"""
        body = {"base_info": {}}
        return await self._post("ilink/bot/msg/notifystart", body=body)

    async def notify_stop(self) -> dict:
        """通知服务端 bot 下线"""
        body = {"base_info": {}}
        return await self._post("ilink/bot/msg/notifystop", body=body)

# ─── 消息处理器 ────────────────────────────────────────────────────────────

class MessageHandler:
    """
    处理收到的微信消息。
    解析消息，保存 context_token，通过回调分发给 LLM 处理。
    """

    def __init__(self, client: ILinkClient, store: WeChatStore):
        self.client = client
        self.store = store
        # 回调: async (wxid: str, content: str) -> List[str] (回复文本列表)
        self.on_message: Optional[Callable[[str, str], Awaitable[List[str]]]] = None

    async def handle_incoming(self, raw_msg: dict) -> Optional[List[str]]:
        """处理一条原始消息，返回回复文本列表"""
        msg = self._parse_message(raw_msg)
        if not msg:
            return None

        # 保存 context_token
        self.store.save_context_token(msg.from_user, msg.context_token)

        if not msg.content:
            return None

        print(f"\n📩 [微信] {msg.from_user}: {msg.content}")

        # 调用回调
        if self.on_message:
            replies = await self.on_message(msg.from_user, msg.content)
            return replies
        return None

    @staticmethod
    def _parse_message(raw: dict) -> Optional[InboundMessage]:
        """从 iLink 原始消息解析为 InboundMessage"""
        try:
            msg = raw
            from_user = msg.get("from_user_id", "")
            if not from_user:
                return None

            # 提取文本内容
            items = msg.get("item_list", [])
            content = ""
            for item in items:
                if item.get("type") == 1:  # TEXT
                    text_item = item.get("text_item", {})
                    if text_item.get("text"):
                        content = text_item["text"]
                        break
                elif item.get("type") == 3:  # VOICE - 语音转文字
                    voice_item = item.get("voice_item", {})
                    if voice_item.get("text"):
                        content = f"[语音] {voice_item['text']}"

            if not content:
                return None

            # msg_id 可能来自 msg_id 或 message_id 字段
            msg_id = str(msg.get("message_id", "")) or str(uuid.uuid4())

            return InboundMessage(
                msg_id=msg_id,
                from_user=from_user,
                content=content,
                timestamp_ms=msg.get("create_time_ms", int(time.time() * 1000)),
                context_token=msg.get("context_token", ""),
                msg_type=items[0].get("type", 1) if items else 1,
            )
        except Exception as e:
            print(f"⚠️  解析消息失败: {e}")
            return None

# ─── Bot 主循环 ────────────────────────────────────────────────────────────

class WeChatBot:
    """
    微信 Bot 主控。
    管理登录态、消息接收循环。
    """

    def __init__(self, data_dir: str = "", on_message: Callable = None):
        self.store = WeChatStore(data_dir)
        self.client = ILinkClient()
        self.handler = MessageHandler(self.client, self.store)
        self._running = False
        self._task = None
        self._account: Optional[WeChatAccount] = None
        self._login_event = asyncio.Event()
        self._login_qrcode_url = ""
        self._verify_code: Optional[str] = None
        self._verify_code_event = asyncio.Event()
        if on_message:
            self.handler.on_message = on_message

    # ── 登录管理 ──

    @property
    def is_logged_in(self) -> bool:
        return bool(self._account and self._account.bot_token)

    @property
    def qrcode_url(self) -> str:
        return self._login_qrcode_url

    async def login_with_qr(self) -> dict:
        """二维码登录流程，返回登录结果"""
        print("🔑 正在获取微信登录二维码...")
        try:
            qr_resp = await self.client.get_qrcode()
        except Exception as e:
            return {"success": False, "message": f"获取二维码失败: {e}"}

        qrcode = qr_resp.get("qrcode", "")
        qrcode_url = qr_resp.get("qrcode_img_content", "")
        if not qrcode:
            return {"success": False, "message": "获取二维码失败: 返回为空"}
        self._login_qrcode_url = qrcode_url
        self._login_event.clear()

        print(f"📱 请用微信扫描二维码登录")
        print(f"🔗 二维码链接: {qrcode_url}")

        # 长轮询扫码状态（最多 8 分钟）
        deadline = time.time() + 480
        pending_code = ""
        qr_refresh = 0
        max_qr_refresh = 3

        while time.time() < deadline:
            try:
                status_resp = await self.client.poll_qrcode_status(
                    qrcode, verify_code=pending_code
                )
                status = status_resp.get("status", "wait")
                print(f"  QR status: {status}")

                if status == "confirmed":
                    bot_token = status_resp.get("bot_token", "")
                    bot_id = status_resp.get("ilink_bot_id", "")
                    base_url = status_resp.get("baseurl", ILINK_BASE_URL)
                    user_id = status_resp.get("ilink_user_id", "")
                    if bot_token and bot_id:
                        self._account = WeChatAccount(
                            bot_token=bot_token,
                            bot_id=bot_id,
                            base_url=base_url,
                            user_id=user_id,
                        )
                        self.store.save_account(self._account)
                        self.client.token = bot_token
                        self.client.base_url = base_url
                        self._login_event.set()
                        print(f"✅ 微信登录成功！bot_id={bot_id}")
                        # Auto-start message loop if not already running
                        if not self._task or self._task.done():
                            try:
                                await self.client.notify_start()
                            except Exception as e:
                                print(f"⚠️  notifyStart 失败: {e}")
                            self._running = True
                            self._task = asyncio.create_task(self._message_loop())
                            print("🔄 消息接收循环已自动启动")
                        return {
                            "success": True,
                            "message": "登录成功",
                            "bot_id": bot_id,
                            "user_id": user_id,
                        }
                    return {"success": False, "message": "登录确认但缺少 token"}

                elif status == "scaned":
                    print("  👆 已扫码，等待确认...")
                    qr_refresh = 0

                elif status == "expired":
                    qr_refresh += 1
                    if qr_refresh > max_qr_refresh:
                        return {"success": False, "message": "二维码多次过期，请稍后重试"}
                    print("  ⏳ 二维码过期，刷新中...")
                    qr_resp = await self.client.get_qrcode()
                    qrcode = qr_resp.get("qrcode", "")
                    qrcode_url = qr_resp.get("qrcode_img_content", "")
                    self._login_qrcode_url = qrcode_url
                    print(f"  🔗 新二维码: {qrcode_url}")

                elif status == "need_verifycode":
                    print("  🔢 需要输入配对码，请通过 POST /api/wechat/login/verify-code 提交")
                    # Wait for the verify code via API
                    self._verify_code_event.clear()
                    try:
                        await asyncio.wait_for(self._verify_code_event.wait(), timeout=120)
                        pending_code = self._verify_code or ""
                        print(f"  🔢 已收到验证码，继续轮询...")
                    except asyncio.TimeoutError:
                        print("  ⏰ 等待验证码超时")
                        pending_code = ""

                elif status in ("scaned_but_redirect",):
                    redirect_host = status_resp.get("redirect_host", "")
                    if redirect_host:
                        self.client.base_url = f"https://{redirect_host}"
                        print(f"  🔀 重定向到: {self.client.base_url}")

                elif status in ("binded_redirect",):
                    print("  ℹ️  此账号已绑定过")
                    # 尝试加载本地已有凭证
                    local = self.store.load_account()
                    if local:
                        self._account = local
                        self.client.token = local.bot_token
                        self.client.base_url = local.base_url
                        self._login_event.set()
                        return {"success": True, "message": "账号已绑定，使用本地凭证"}
                    return {"success": False, "message": "账号已绑定但本地无凭证"}

            except Exception as e:
                print(f"  ⚠️  轮询出错: {e}")

            await asyncio.sleep(1)

        return {"success": False, "message": "登录超时"}

    def set_verify_code(self, code: str):
        """设置配对验证码（由 API 调用），唤醒等待中的登录轮询"""
        self._verify_code = code
        self._verify_code_event.set()

    # ── 消息接收循环 ──

    async def _message_loop(self):
        """后台长轮询消息接收循环"""
        store = self.store
        sync_buf = store.load_sync_buf()

        print("🔄 消息接收循环已启动")

        while self._running and self.is_logged_in:
            try:
                resp = await self.client.get_updates(sync_buf=sync_buf)
                ret = resp.get("ret", -1)
                errcode = resp.get("errcode")

                if ret != 0 and errcode == -14:
                    # Session timeout, need to re-login
                    print("⚠️  Session 超时，需要重新登录")
                    self._account = None
                    break

                # 保存 sync_buf
                new_buf = resp.get("get_updates_buf", "")
                if new_buf:
                    sync_buf = new_buf
                    store.save_sync_buf(sync_buf)

                # 处理消息
                msgs = resp.get("msgs", [])
                for raw_msg in msgs:
                    replies = await self.handler.handle_incoming(raw_msg)
                    if replies:
                        from_user = raw_msg.get("from_user_id", "")
                        ctx_token = raw_msg.get("context_token", "")
                        for i, reply_text in enumerate(replies):
                            try:
                                # Add a small delay between multi-part messages
                                if i > 0:
                                    await asyncio.sleep(0.8)
                                await self.client.send_message(
                                    to_user=from_user,
                                    text=reply_text,
                                    context_token=ctx_token,
                                )
                            except Exception as e:
                                print(f"⚠️  发送回复[{i}]失败: {e}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"⚠️  消息循环异常: {e}")
                await asyncio.sleep(5)

        print("⏹️  消息接收循环已停止")

    # ── 启停 ──

    async def start(self):
        """启动 Bot"""
        # 尝试加载已有账号
        account = self.store.load_account()
        if account:
            self._account = account
            self.client.token = account.bot_token
            self.client.base_url = account.base_url
            self._login_event.set()
            print(f"✅ 已加载微信账号: {account.bot_id}")

        self._running = True
        if self.is_logged_in:
            # 通知上线
            try:
                await self.client.notify_start()
            except Exception as e:
                print(f"⚠️  notifyStart 失败: {e}")
            # 启动消息循环
            self._task = asyncio.create_task(self._message_loop())
        else:
            print("⚠️  微信 Bot 未登录，请调用 /api/wechat/login 扫码登录")

    async def stop(self):
        """停止 Bot"""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self.is_logged_in:
            try:
                await self.client.notify_stop()
            except Exception:
                pass
        print("⏹️  WeChat Bot 已停止")

    async def restart(self):
        """重启消息循环"""
        await self.stop()
        await self.start()

    def get_status(self) -> dict:
        return {
            "logged_in": self.is_logged_in,
            "running": self._running,
            "bot_id": self._account.bot_id if self._account else "",
            "user_id": self._account.user_id if self._account else "",
            "base_url": self._account.base_url if self._account else "",
        }


# ─── 全局单例 ──────────────────────────────────────────────────────────────

_bot_instance: Optional[WeChatBot] = None

def get_bot(on_message: Callable = None) -> WeChatBot:
    global _bot_instance
    if _bot_instance is None:
        _bot_instance = WeChatBot(on_message=on_message)
    elif on_message and _bot_instance.handler.on_message is None:
        _bot_instance.handler.on_message = on_message
    return _bot_instance
