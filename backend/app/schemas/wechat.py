from pydantic import BaseModel


class LoginResponse(BaseModel):
    success: bool
    message: str
    bot_id: str = ""
    user_id: str = ""
    qrcode_url: str = ""


class BotStatusResponse(BaseModel):
    logged_in: bool
    running: bool
    bot_id: str = ""
    user_id: str = ""
    base_url: str = ""


class SendMessageRequest(BaseModel):
    to_user: str
    text: str


class VerifyCodeRequest(BaseModel):
    code: str
