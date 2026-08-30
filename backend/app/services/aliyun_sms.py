"""阿里云号码认证服务（短信认证）接入 — 纯 httpx 实现，无 SDK 依赖

接口对（产品：号码认证服务 / 短信认证，Endpoint: dypnsapi.aliyuncs.com）：
- SendSmsVerifyCode  发送验证码：验证码由阿里云端生成（##code## 占位符），无需自建存储
- CheckSmsVerifyCode 核验验证码：免费，核验结果以 Model.VerifyResult == "PASS" 为准

凭证：RAM 子账号 AccessKey，需授权 AliyunDypnsFullAccess
签名/模板：号码认证控制台"赠送签名/模板"（自定义签名暂不支持），发送与核验 SchemeName 必须一致
"""

import base64
import hashlib
import hmac
import json
import urllib.parse
import uuid

import httpx

from app.config import settings

ENDPOINT = "https://dypnsapi.aliyuncs.com"


def _percent_encode(value: str) -> str:
    """阿里云 RPC 签名专用编码（RFC3986，+ → %20，* → %2A，%7E → ~）"""
    return urllib.parse.quote(value, safe="-_.~")


def _sign(params: dict, access_key_secret: str) -> str:
    canonical = "&".join(
        f"{_percent_encode(k)}={_percent_encode(v)}" for k, v in sorted(params.items())
    )
    string_to_sign = "GET&%2F&" + _percent_encode(canonical)
    digest = hmac.new(
        (access_key_secret + "&").encode(), string_to_sign.encode(), hashlib.sha1
    ).digest()
    return base64.b64encode(digest).decode()


def _rpc_call(action: str, business_params: dict) -> dict:
    """发起阿里云 RPC GET 请求，返回响应 JSON（含 Code/Success/Model）"""
    params = {
        "AccessKeyId": settings.SMS_ACCESS_KEY_ID,
        "Action": action,
        "Format": "JSON",
        "RegionId": "cn-hangzhou",
        "SignatureMethod": "HMAC-SHA1",
        "SignatureNonce": str(uuid.uuid4()),
        "SignatureVersion": "1.0",
        "Timestamp": _utc_timestamp(),
        "Version": "2017-05-25",
        **business_params,
    }
    params["Signature"] = _sign(params, settings.SMS_ACCESS_KEY_SECRET)
    resp = httpx.get(ENDPOINT, params=params, timeout=10)
    # 阿里云业务错误（签名无效/未开通等）也返回 JSON body，不抛异常，交给上层解析 Code
    try:
        return resp.json()
    except Exception:
        return {"Code": f"HTTP_{resp.status_code}", "Message": resp.text[:200]}


def _utc_timestamp() -> str:
    """UTC ISO8601，阿里云要求精确到秒且格式为 YYYY-MM-DDThh:mm:ssZ"""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def send_sms_verify_code(phone: str) -> dict:
    """发送短信验证码（阿里云端生成，5 分钟有效，60s 间隔频控由接口默认值兜底）

    Returns: {"ok": bool, "detail": str}
    """
    params = {
        "PhoneNumber": phone,
        "SignName": settings.SMS_SIGN_NAME,
        "TemplateCode": settings.SMS_TEMPLATE_CODE,
        "TemplateParam": json.dumps(
            {"code": "##code##", "min": settings.SMS_CODE_TTL_MIN}, ensure_ascii=False
        ),
        "CodeLength": 6,
        "CodeType": 1,  # 纯数字
        "ValidTime": settings.SMS_CODE_TTL_MIN * 60,
        "Interval": 60,
        "ReturnVerifyCode": "false",
    }
    if settings.SMS_SCHEME_NAME:
        params["SchemeName"] = settings.SMS_SCHEME_NAME
    data = _rpc_call("SendSmsVerifyCode", params)
    if data.get("Code") == "OK" and data.get("Success"):
        return {"ok": True, "detail": "验证码已发送"}
    return {"ok": False, "detail": _friendly_error(data)}


def check_sms_verify_code(phone: str, code: str) -> dict:
    """核验验证码（免费）。核验结果仅以 Model.VerifyResult == PASS 为准

    Returns: {"ok": bool, "detail": str}
    """
    params = {
        "PhoneNumber": phone,
        "VerifyCode": code,
    }
    if settings.SMS_SCHEME_NAME:
        params["SchemeName"] = settings.SMS_SCHEME_NAME
    data = _rpc_call("CheckSmsVerifyCode", params)
    if data.get("Code") == "OK" and data.get("Success"):
        result = (data.get("Model") or {}).get("VerifyResult", "")
        if result == "PASS":
            return {"ok": True, "detail": "验证通过"}
        return {"ok": False, "detail": "验证码错误或已过期"}
    return {"ok": False, "detail": _friendly_error(data)}


_ERROR_MAP = {
    "MOBILE_NUMBER_ILLEGAL": "手机号码格式错误",
    "BUSINESS_LIMIT_CONTROL": "该手机号今日发送次数已达上限，请明日再试",
    "FREQUENCY_FAIL": "发送太频繁，请稍后再试",
    "INVALID_PARAMETERS": "参数错误，请检查签名/模板配置",
    "FUNCTION_NOT_OPENED": "短信认证功能未开通，请到号码认证控制台开启",
    "InvalidAccessKeyId.NotFound": "AccessKey 无效，请检查 SMS_ACCESS_KEY_ID",
    "SignatureDoesNotMatch": "签名计算失败，请检查 AccessKey Secret",
}


def _friendly_error(data: dict) -> str:
    code = data.get("Code", "")
    return _ERROR_MAP.get(code) or data.get("Message") or f"短信服务异常（{code or '未知错误'}）"
