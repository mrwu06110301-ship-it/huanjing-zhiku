"""用户路由 — 注册、登录、查看"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    UserRegister, UserLogin, UserOut, Token, UserUpdate, PasswordChange,
    SmsSendRequest, SmsLoginRequest, WechatLoginRequest, UsernameCheck,
)
from app.services.auth import hash_password, verify_password, create_access_token
from app.services import aliyun_sms, wechat
from app.config import settings
from app.dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/users", tags=["用户"])


@router.post("/register/check-username")
async def check_username(data: UsernameCheck, db: AsyncSession = Depends(get_db)):
    """注册第一步：用户名占用预校验（不创建账号）"""
    username = data.username.strip()
    if len(username) < 3 or len(username) > 50:
        raise HTTPException(status_code=400, detail="用户名需 3-50 个字符")
    result = await db.execute(select(User).where(User.username == username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="用户名已被注册")
    return {"detail": "用户名可用", "username": username}


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """注册：手机验证码关联通过后才创建账号并签发 token（自动登录）

    流程：第一步仅预校验用户名（/register/check-username，不建号）；
    第二步手机验证码校验通过后，本接口一次性完成建号 + 写 phone + 发 token。
    """
    # 手机号+验证码必填：验证通过是注册成功的前置条件
    if not settings.SMS_ENABLED:
        raise HTTPException(status_code=501, detail="短信服务暂未开通，注册暂不可用，敬请期待")
    if not data.phone or not data.sms_code:
        raise HTTPException(status_code=400, detail="请先完成手机验证码关联")
    # 阿里云端核验验证码（SendSmsVerifyCode 动态生成的验证码由此接口校验）
    check = aliyun_sms.check_sms_verify_code(data.phone.strip(), data.sms_code.strip())
    if not check["ok"]:
        raise HTTPException(status_code=400, detail=check["detail"])
    phone = data.phone.strip()

    username = data.username.strip()
    # 用户名唯一性检查
    result = await db.execute(select(User).where(User.username == username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="用户名已被注册")

    # 手机号唯一性检查
    result = await db.execute(select(User).where(User.phone == phone))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="手机号已被注册")

    # email 可选：填写了才查重（个人中心补填场景兼容）
    email = (data.email or "").strip()
    if email:
        result = await db.execute(select(User).where(User.email == email))
        if result.scalars().first():
            raise HTTPException(status_code=400, detail="邮箱已被注册")

    user = User(
        username=username,
        email=email,
        phone=phone,
        nickname=data.nickname or username,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    """登录：账号+密码（账号支持 用户名/手机号/邮箱）"""
    account = (data.account or data.username or "").strip()
    if not account:
        raise HTTPException(status_code=400, detail="请输入账号")
    result = await db.execute(
        select(User).where(
            or_(User.username == account, User.phone == account, User.email == account)
        )
    )
    user = result.scalars().first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="账号或密码错误")

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


# ========== 短信登录/注册（阿里云号码认证服务） ==========

@router.post("/sms/send")
async def send_sms(data: SmsSendRequest, db: AsyncSession = Depends(get_db)):
    """发送短信验证码（阿里云号码认证服务，验证码由阿里云端生成与核验）"""
    if not settings.SMS_ENABLED:
        raise HTTPException(status_code=501, detail="短信服务暂未开通，敬请期待")
    send = aliyun_sms.send_sms_verify_code(data.phone)
    if not send["ok"]:
        raise HTTPException(status_code=400, detail=send["detail"])
    return {"detail": send["detail"]}


@router.post("/sms/login", response_model=Token)
async def sms_login(data: SmsLoginRequest, db: AsyncSession = Depends(get_db)):
    """短信验证码登录：已注册直接登录，未注册自动创建账号

    自动建号规则：username=手机号（冲突则加随机后缀）、nickname=手机号、
    随机密码（用户不可知，可后续在个人中心改密）、email 留空。
    """
    if not settings.SMS_ENABLED:
        raise HTTPException(status_code=501, detail="短信登录暂未开放，敬请期待")
    phone = data.phone.strip()
    check = aliyun_sms.check_sms_verify_code(phone, data.sms_code.strip())
    if not check["ok"]:
        raise HTTPException(status_code=401, detail=check["detail"])

    # 已注册（手机号匹配）→ 直接登录
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalars().first()
    if user:
        if not user.is_active:
            raise HTTPException(status_code=403, detail="账号已被禁用，请联系管理员")
        token = create_access_token({"sub": str(user.id)})
        return Token(access_token=token)

    # 未注册 → 自动创建账号
    username = phone
    result = await db.execute(select(User).where(User.username == username))
    if result.scalars().first():
        username = f"{phone}_{uuid.uuid4().hex[:4]}"  # 手机号被占作用户名时加随机后缀
    user = User(
        username=username,
        email="",
        phone=phone,
        nickname=phone,
        hashed_password=hash_password(uuid.uuid4().hex + uuid.uuid4().hex),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.post("/bind-phone")
async def bind_phone(
    data: SmsLoginRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """已注册用户绑定/关联手机号（个人中心补绑场景）

    通过阿里云端核验验证码一致后才写入 phone；手机号被占用时返回 400。
    """
    if not settings.SMS_ENABLED:
        raise HTTPException(status_code=501, detail="短信服务暂未开通，可稍后在个人中心绑定")
    check = aliyun_sms.check_sms_verify_code(data.phone.strip(), data.sms_code.strip())
    if not check["ok"]:
        raise HTTPException(status_code=400, detail=check["detail"])
    phone = data.phone.strip()
    exists = await db.execute(
        select(User).where(User.phone == phone, User.id != current_user.id)
    )
    if exists.scalars().first():
        raise HTTPException(status_code=400, detail="该手机号已被其他账号绑定")
    current_user.phone = phone
    db.add(current_user)
    await db.commit()
    return {"detail": "手机号绑定成功", "phone": phone}


# ========== 微信扫码登录（开放平台网站应用，AppID 审核通过后即用） ==========

@router.get("/wechat/qrcode")
async def wechat_qrcode():
    """返回微信扫码授权页 URL（前端内嵌 iframe 或跳转），state 防 CSRF"""
    if not wechat.is_configured():
        raise HTTPException(status_code=501, detail="微信登录暂未开放，敬请期待")
    state = uuid.uuid4().hex
    return {"qrcode_url": wechat.build_qr_url(state), "state": state}


@router.post("/wechat/login", response_model=Token)
async def wechat_login(data: WechatLoginRequest, db: AsyncSession = Depends(get_db)):
    """微信扫码授权登录/注册：code 换 openid → 查找/自动建号 → 站内 JWT

    自动建号规则：username=wx_{openid后8位}（冲突加随机后缀）、nickname=微信昵称、
    头像同步微信、随机密码（不可知）；手机号留空，可后续个人中心绑定。
    """
    if not wechat.is_configured():
        raise HTTPException(status_code=501, detail="微信登录暂未开放，敬请期待")

    # 1. code 换 access_token + openid
    token_info = await wechat.exchange_code(data.code.strip())
    if not token_info["ok"]:
        raise HTTPException(status_code=401, detail=token_info["detail"])
    openid, unionid = token_info["openid"], token_info.get("unionid", "")

    # 2. openid 已绑定 → 直接登录
    result = await db.execute(select(User).where(User.wechat_openid == openid))
    user = result.scalars().first()
    if user:
        if not user.is_active:
            raise HTTPException(status_code=403, detail="账号已被禁用，请联系管理员")
        token = create_access_token({"sub": str(user.id)})
        return Token(access_token=token)

    # 3. 未绑定 → 拉微信用户信息，自动创建账号
    wx_info = await wechat.get_user_info(token_info["access_token"], openid)
    nickname = wx_info.get("nickname") if wx_info["ok"] else ""
    username = f"wx_{openid[-8:]}"
    result = await db.execute(select(User).where(User.username == username))
    if result.scalars().first():
        username = f"wx_{uuid.uuid4().hex[:12]}"
    user = User(
        username=username,
        email="",
        phone="",
        nickname=nickname or username,
        avatar=wx_info.get("headimgurl", "") if wx_info["ok"] else "",
        hashed_password=hash_password(uuid.uuid4().hex + uuid.uuid4().hex),
        wechat_openid=openid,
        wechat_unionid=unionid,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
async def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新当前用户个人信息（昵称/邮箱/头像/手机号）"""
    if data.nickname is not None:
        current_user.nickname = data.nickname.strip() or current_user.nickname
    if data.email is not None:
        email = data.email.strip()
        if email:
            exists = await db.execute(
                select(User).where(User.email == email, User.id != current_user.id)
            )
            if exists.scalars().first():
                raise HTTPException(status_code=400, detail="该邮箱已被其他用户使用")
            current_user.email = email
    if data.avatar is not None:
        current_user.avatar = data.avatar
    if data.phone is not None:
        current_user.phone = data.phone.strip()
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.put("/me/password")
async def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """修改当前用户密码（需验证原密码）"""
    if not verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="原密码错误")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少 6 位")
    current_user.hashed_password = hash_password(data.new_password)
    db.add(current_user)
    await db.commit()
    return {"message": "密码修改成功"}


@router.get("/list", response_model=list[UserOut])
async def list_users(
    page: int = 1,
    page_size: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """管理员获取用户列表"""
    result = await db.execute(
        select(User).order_by(User.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )
    return result.scalars().all()


@router.get("/count")
async def count_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    total = await db.execute(select(User))
    return {"total": len(total.scalars().all())}


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """管理员删除用户（软删除：禁用 + 数据匿名化，保留内容完整性）

    - 不能删除自己和其他管理员
    - 软删除：置 is_active=False + 用户名/昵称/手机号/邮箱匿名化，释放唯一字段供重新注册
    - 该用户发布的文章/评论/留言保留（匿名化为"已注销用户"），不破坏内容与计数
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="不能删除管理员账号")

    suffix = uuid.uuid4().hex[:8]
    user.is_active = False
    user.username = f"deleted_{user.id}_{suffix}"
    user.nickname = "已注销用户"
    user.email = ""
    user.phone = ""
    user.hashed_password = hash_password(uuid.uuid4().hex + uuid.uuid4().hex)
    db.add(user)
    await db.commit()
    return {"detail": f"用户 {user_id} 已删除（内容保留并匿名化）"}
