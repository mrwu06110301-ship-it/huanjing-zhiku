"""用户相关 Schema"""

from pydantic import BaseModel, Field, SecretStr
from datetime import datetime


class UserRegister(BaseModel):
    """注册：username/password/phone/sms_code 必填（手机验证通过才创建账号）"""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    nickname: str = Field(default="", max_length=50)
    phone: str = Field(default="", max_length=20)
    sms_code: str = Field(default="", max_length=10)


class UsernameCheck(BaseModel):
    """注册第一步：用户名占用预校验"""
    username: str = Field(..., min_length=3, max_length=50)


class UserLogin(BaseModel):
    """登录：account 兼容用户名/手机号（老字段 username 保留兼容）"""
    username: str = ""
    account: str = ""
    password: str


class SmsSendRequest(BaseModel):
    """短信验证码发送（预留，短信服务开通前返回未开放）"""
    phone: str = Field(..., min_length=11, max_length=11)


class SmsLoginRequest(BaseModel):
    """短信验证码登录/注册/验证/找回（多场景复用）"""
    phone: str = Field(..., min_length=11, max_length=11)
    sms_code: str = Field(..., min_length=4, max_length=10)
    # sms/verify-login 场景：密码登录返回的 pending_sms 短时效票据
    pending_token: str = Field(default="", max_length=1024)
    # forgot-password 场景：重置后的新密码
    new_password: SecretStr | None = None


class PasswordSetup(BaseModel):
    """短信登录后补设账号密码"""
    username: str = Field(default="", max_length=50)
    new_password: SecretStr = Field(..., min_length=6, max_length=100)


class WechatLoginRequest(BaseModel):
    """微信扫码登录（预留）"""
    code: str = Field(..., min_length=1, max_length=100)


class UserOut(BaseModel):
    id: int
    username: str
    nickname: str
    avatar: str = ""
    phone: str | None = None
    role: str = "user"
    can_upload_video: bool = False
    is_active: bool = True
    wechat_openid: str = ""
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    nickname: str | None = None
    avatar: str | None = None
    phone: str | None = None


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


class Token(BaseModel):
    """登录凭据。token_type 额外标记：
    - bearer：正式登录态
    - pending_sms：密码正确但未绑手机号，需短信验证补绑（10 分钟票据）
    - need_password：短信登录的账号为随机密码，前端引导补设账号密码
    """
    access_token: str
    token_type: str = "bearer"
