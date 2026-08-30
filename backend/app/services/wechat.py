"""微信开放平台「网站应用」扫码登录 — 纯 httpx 实现，无 SDK 依赖

OAuth2 流程（微信扫码登录）：
1. 前端跳转/内嵌二维码：https://open.weixin.qq.com/connect/qrconnect
   ?appid=APPID&redirect_uri=REDIRECT(encode)&response_type=code&scope=snsapi_login&state=STATE#wechat_redirect
2. 用户扫码确认后微信带 code 回跳 redirect_uri
3. 后端用 code 换 access_token：/sns/oauth2/access_token
4. 拉用户信息（头像/昵称）：/sns/userinfo
5. 按 openid 查找/创建用户 → 签发站内 JWT

凭证：微信开放平台 → 管理中心 → 网站应用审核通过后的 AppID/AppSecret（走 systemd 环境变量）
"""

import urllib.parse

import httpx

from app.config import settings

OPEN_API = "https://api.weixin.qq.com"
OPEN_CONNECT = "https://open.weixin.qq.com/connect/qrconnect"


def is_configured() -> bool:
    return bool(settings.WECHAT_APP_ID and settings.WECHAT_APP_SECRET)


def build_qr_url(state: str) -> str:
    """生成扫码授权页 URL（前端可整页跳转或内嵌 iframe）"""
    redirect = urllib.parse.quote(f"https://yigan.tech/wechat/callback")
    return (
        f"{OPEN_CONNECT}?appid={settings.WECHAT_APP_ID}"
        f"&redirect_uri={redirect}&response_type=code"
        f"&scope=snsapi_login&state={state}#wechat_redirect"
    )


async def exchange_code(code: str) -> dict:
    """code 换 access_token + openid

    Returns: {"ok": bool, "detail": str, "openid": str, "unionid": str, "access_token": str}
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{OPEN_API}/sns/oauth2/access_token",
            params={
                "appid": settings.WECHAT_APP_ID,
                "secret": settings.WECHAT_APP_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
    data = resp.json()
    if data.get("errcode"):
        return {"ok": False, "detail": _friendly(data.get("errcode"), data.get("errmsg", ""))}
    return {
        "ok": True,
        "detail": "ok",
        "openid": data.get("openid", ""),
        "unionid": data.get("unionid", ""),
        "access_token": data.get("access_token", ""),
    }


async def get_user_info(access_token: str, openid: str) -> dict:
    """拉取微信用户信息（昵称/头像）

    Returns: {"ok": bool, "detail": str, "nickname": str, "headimgurl": str}
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{OPEN_API}/sns/userinfo",
            params={"access_token": access_token, "openid": openid},
        )
    data = resp.json()
    if data.get("errcode"):
        return {"ok": False, "detail": _friendly(data.get("errcode"), data.get("errmsg", ""))}
    return {
        "ok": True,
        "detail": "ok",
        "nickname": data.get("nickname", ""),
        "headimgurl": data.get("headimgurl", ""),
    }


def _friendly(errcode: int, errmsg: str) -> str:
    mapping = {
        40029: "微信授权 code 无效或已使用，请重新扫码",
        42001: "微信授权已过期，请重新扫码",
        40163: "授权 code 已被使用，请重新扫码",
        40013: "AppID 无效，请检查微信开放平台配置",
        40125: "AppSecret 无效，请检查微信开放平台配置",
        10005: "应用未开通扫码登录权限（scope 错误或审核未通过）",
    }
    return mapping.get(errcode) or f"微信授权失败（{errcode}: {errmsg}）"
