import asyncio

from fastapi import APIRouter, HTTPException

from app.schemas.wechat import BotStatusResponse, LoginResponse, SendMessageRequest, VerifyCodeRequest
from app.services.wechat_bot import get_bot

router = APIRouter(prefix="/api/wechat", tags=["wechat"])


@router.get("/login", response_model=LoginResponse)
async def wechat_login():
    """获取微信登录二维码（返回二维码URL）"""
    bot = get_bot()
    result = await bot.login_with_qr()
    return LoginResponse(
        success=result.get("success", False),
        message=result.get("message", ""),
        bot_id=result.get("bot_id", ""),
        user_id=result.get("user_id", ""),
        qrcode_url=bot.qrcode_url,
    )


@router.get("/login/qrcode")
async def get_qrcode_url():
    """只返回二维码URL，不触发完整登录流程（用于前端展示）"""
    bot = get_bot()
    if bot.qrcode_url:
        return {"qrcode_url": bot.qrcode_url}
    # Fallback: 触发一次登录
    bot2 = get_bot()
    qr_resp = await bot2.client.get_qrcode() if bot2.client else {"qrcode_img_content": ""}
    url = qr_resp.get("qrcode_img_content", "")
    return {"qrcode_url": url}


@router.post("/login/verify-code")
async def submit_verify_code(req: VerifyCodeRequest):
    """提交扫码后的配对验证码"""
    bot = get_bot()
    bot.set_verify_code(req.code)
    return {"success": True, "message": "验证码已提交"}


@router.get("/status", response_model=BotStatusResponse)
async def bot_status():
    """获取Bot状态"""
    bot = get_bot()
    status = bot.get_status()
    return BotStatusResponse(**status)


@router.post("/stop")
async def stop_bot():
    """停止微信 Bot"""
    bot = get_bot()
    await bot.stop()
    return {"success": True}


@router.post("/start")
async def start_bot():
    """启动微信 Bot"""
    bot = get_bot()
    await bot.start()
    return {"success": True}


@router.post("/restart")
async def restart_bot():
    """重启微信 Bot"""
    bot = get_bot()
    await bot.restart()
    return {"success": True}


@router.post("/send")
async def send_message(req: SendMessageRequest):
    """通过 Bot 发送消息（测试用）"""
    bot = get_bot()
    if not bot.is_logged_in:
        raise HTTPException(status_code=400, detail="Bot 未登录")
    await bot.client.send_message(to_user=req.to_user, text=req.text)
    return {"success": True}
